import type { SplitRepo, ListSplitsOptions } from "@logit/core/data/splitRepo";
import type {
  WorkoutSplit,
  SplitDay,
  PlannedBlock,
} from "@logit/core/domain/WorkoutSplit";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

export function createSqliteSplitRepo(): SplitRepo {
  return {
    async saveSplit(split: WorkoutSplit): Promise<void> {
      const db = getDb();
      const updatedAt = nowMs();

      await db.run(
        `
        INSERT INTO splits(id, name, archived, created_at_ms, updated_at_ms, owner_id)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          archived=excluded.archived,
          updated_at_ms=excluded.updated_at_ms
        `,
        [
          split.id,
          split.name,
          split.archived ? 1 : 0,
          split.createdAtMs,
          updatedAt,
          getActiveOwnerId(),
        ],
      );

      await db.run(`DELETE FROM split_days WHERE split_id = ?`, [split.id]);

      for (const day of split.days) {
        await db.run(
          `INSERT INTO split_days(id, split_id, order_index, name) VALUES(?, ?, ?, ?)`,
          [day.id, split.id, day.orderIndex, day.name ?? null],
        );

        for (const block of day.blocks) {
          if (block.type === "strength") {
            await db.run(
              `
              INSERT INTO planned_blocks(
                id, day_id, block_type, order_index,
                exercise_name, exercise_id,
                target_sets, target_reps, target_weight,
                activity_name
              )
              VALUES(?, ?, 'strength', ?, ?, ?, ?, ?, ?, NULL)
              `,
              [
                block.id,
                day.id,
                block.orderIndex,
                block.exerciseName,
                block.exerciseId ?? null,
                block.targets?.sets ?? null,
                block.targets?.reps ?? null,
                block.targets?.weight ?? null,
              ],
            );
          } else if (block.type === "cardio") {
            await db.run(
              `
              INSERT INTO planned_blocks(
                id, day_id, block_type, order_index,
                exercise_name, exercise_id,
                target_sets, target_reps, target_weight,
                activity_name
              )
              VALUES(?, ?, 'cardio', ?, NULL, NULL, NULL, NULL, NULL, ?)
              `,
              [block.id, day.id, block.orderIndex, block.activityName],
            );
          }
        }
      }

      await db.run(`UPDATE splits SET updated_at_ms = ? WHERE id = ?`, [
        updatedAt,
        split.id,
      ]);
    },

    async getSplit(id: string): Promise<WorkoutSplit | null> {
      const db = getDb();

      const ownerId = getActiveOwnerId();
      const splitRes = await db.query(
        `
        SELECT id, name, archived, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs
        FROM splits
        WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)
        `,
        [id, ownerId],
      );

      const base = (splitRes.values?.[0] as any) ?? null;
      if (!base) return null;

      const daysRes = await db.query(
        `
        SELECT id, order_index as orderIndex, name
        FROM split_days
        WHERE split_id = ?
        ORDER BY order_index ASC
        `,
        [id],
      );

      const days: SplitDay[] = [];
      for (const d of (daysRes.values ?? []) as any[]) {
        const blocksRes = await db.query(
          `
          SELECT
            id, block_type as blockType, order_index as orderIndex,
            exercise_name as exerciseName, exercise_id as exerciseId,
            target_sets as targetSets, target_reps as targetReps, target_weight as targetWeight,
            activity_name as activityName
          FROM planned_blocks
          WHERE day_id = ?
          ORDER BY order_index ASC
          `,
          [d.id],
        );

        const blocks: PlannedBlock[] = ((blocksRes.values ?? []) as any[]).map((r) => {
          if (r.blockType === "cardio") {
            return {
              type: "cardio" as const,
              id: r.id,
              orderIndex: r.orderIndex,
              activityName: r.activityName ?? "",
            };
          }
          return {
            type: "strength" as const,
            id: r.id,
            orderIndex: r.orderIndex,
            exerciseName: r.exerciseName ?? "",
            exerciseId: r.exerciseId ?? undefined,
            targets:
              r.targetSets == null && r.targetReps == null && r.targetWeight == null
                ? undefined
                : {
                    sets: r.targetSets ?? undefined,
                    reps: r.targetReps ?? undefined,
                    weight: r.targetWeight ?? undefined,
                  },
          };
        });

        days.push({
          id: d.id,
          orderIndex: d.orderIndex,
          name: d.name ?? undefined,
          blocks,
        });
      }

      return {
        id: base.id,
        name: base.name,
        archived: !!base.archived,
        createdAtMs: base.createdAtMs,
        updatedAtMs: base.updatedAtMs,
        days,
      };
    },

    async getListSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]> {
      const db = getDb();

      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const includeArchived = options?.includeArchived ?? false;
      const search = options?.search?.trim();
      const sortBy = options?.sortBy ?? "updated";
      const order = options?.order ?? "desc";

      const ownerId = getActiveOwnerId();
      const where: string[] = ["(owner_id = ? OR owner_id IS NULL)"];
      const params: any[] = [ownerId];

      if (!includeArchived) where.push("archived = 0");
      if (search) {
        where.push("name LIKE ?");
        params.push(`%${search}%`);
      }

      const sortCol =
        sortBy === "created"
          ? "created_at_ms"
          : sortBy === "name"
            ? "name"
            : "updated_at_ms";

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const res = await db.query(
        `
        SELECT id, name, archived, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs
        FROM splits
        ${whereSql}
        ORDER BY ${sortCol} ${order.toUpperCase() === "ASC" ? "ASC" : "DESC"}
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset],
      );

      const splitRows = (res.values ?? []) as any[];
      if (splitRows.length === 0) return [];

      // Fetch day stubs for all returned splits in one query so the list
      // page can show the correct day count without loading full split data.
      const placeholders = splitRows.map(() => "?").join(",");
      const splitIds = splitRows.map((r) => r.id);
      const daysRes = await db.query(
        `SELECT id, split_id as splitId, order_index as orderIndex, name
         FROM split_days
         WHERE split_id IN (${placeholders})
         ORDER BY order_index ASC`,
        splitIds,
      );

      const daysBySplitId = new Map<string, SplitDay[]>();
      for (const d of (daysRes.values ?? []) as any[]) {
        const list = daysBySplitId.get(d.splitId) ?? [];
        list.push({ id: d.id, orderIndex: d.orderIndex, name: d.name ?? undefined, blocks: [] });
        daysBySplitId.set(d.splitId, list);
      }

      return splitRows.map((r) => ({
        id: r.id,
        name: r.name,
        archived: !!r.archived,
        createdAtMs: r.createdAtMs,
        updatedAtMs: r.updatedAtMs,
        days: daysBySplitId.get(r.id) ?? [],
      }));
    },

    async deleteSplit(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM splits WHERE id = ?`, [id]);
    },

    async setActiveSplitId(id: string | null): Promise<void> {
      const db = getDb();
      const key = `active_split_id:${getActiveOwnerId() ?? "default"}`;
      await db.run(
        `INSERT INTO meta(key, value) VALUES(?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [key, id ?? ""],
      );
    },

    async getActiveSplitId(): Promise<string | null> {
      const db = getDb();
      const key = `active_split_id:${getActiveOwnerId() ?? "default"}`;
      const res = await db.query(`SELECT value FROM meta WHERE key=?`, [key]);
      const v = ((res.values?.[0] as any)?.value as string | undefined) ?? "";
      // Fallback: check old key for existing installs
      if (!v.trim()) {
        const old = await db.query(`SELECT value FROM meta WHERE key='active_split_id'`, []);
        const ov = ((old.values?.[0] as any)?.value as string | undefined) ?? "";
        return ov.trim() ? ov : null;
      }
      return v;
    },
  };
}
