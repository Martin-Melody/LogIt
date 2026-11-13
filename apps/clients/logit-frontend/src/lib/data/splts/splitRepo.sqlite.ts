import type { SplitRepo, ListSplitsOptions } from "@logit/core/data/splitRepo";
import type {
  WorkoutSplit,
  SplitDay,
  PlannedBlock,
  PlannedGroup,
  PlannedMobilityTargets,
} from "@logit/core/domain/WorkoutSplit";
import type { MobilityMetric } from "@logit/core/domain/workout";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

/** A day's schedule fields as stored (null when it has none). */
function dayScheduleJson(day: SplitDay): string | null {
  const v = {
    ...(day.rest ? { rest: true } : {}),
    ...(day.sameDayAsPrevious ? { sameDayAsPrevious: true } : {}),
    ...(day.weekday != null ? { weekday: day.weekday } : {}),
  };
  return Object.keys(v).length ? JSON.stringify(v) : null;
}

function daySchedule(raw: unknown): Pick<SplitDay, "rest" | "sameDayAsPrevious" | "weekday"> {
  const v = parseJson<{ rest?: boolean; sameDayAsPrevious?: boolean; weekday?: number }>(raw);
  if (!v) return {};
  return {
    ...(v.rest ? { rest: true } : {}),
    ...(v.sameDayAsPrevious ? { sameDayAsPrevious: true } : {}),
    ...(typeof v.weekday === "number" ? { weekday: v.weekday } : {}),
  };
}

function parseJson<T>(raw: unknown): T | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** What a drill keeps beyond the shared columns (name, drill id, sets). */
type BlockExtra = {
  groupId?: string;
  metric?: MobilityMetric;
  perSide?: boolean;
  holdSec?: number;
  reps?: number;
};

type BlockRow = {
  name: string | null;
  refId: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  activityName: string | null;
  extra: BlockExtra | null;
};

function plannedBlockRow(block: PlannedBlock): BlockRow | null {
  const group: BlockExtra = block.groupId ? { groupId: block.groupId } : {};
  if (block.type === "strength") {
    return {
      name: block.exerciseName,
      refId: block.exerciseId ?? null,
      sets: block.targets?.sets ?? null,
      reps: block.targets?.reps ?? null,
      weight: block.targets?.weight ?? null,
      activityName: null,
      extra: block.groupId ? group : null,
    };
  }
  if (block.type === "cardio") {
    return {
      name: null,
      refId: null,
      sets: null,
      reps: null,
      weight: null,
      activityName: block.activityName,
      extra: block.groupId ? group : null,
    };
  }
  if (block.type === "mobility") {
    return {
      name: block.drillName,
      refId: block.drillId ?? null,
      sets: block.targets?.sets ?? null,
      reps: null,
      weight: null,
      activityName: null,
      extra: {
        ...group,
        metric: block.metric,
        perSide: block.perSide,
        ...(block.targets?.holdSec ? { holdSec: block.targets.holdSec } : {}),
        ...(block.targets?.reps ? { reps: block.targets.reps } : {}),
      },
    };
  }
  return null;
}

function plannedBlockFromRow(r: any): PlannedBlock {
  const extra = parseJson<BlockExtra>(r.extraJson) ?? {};
  const group = extra.groupId ? { groupId: extra.groupId } : {};
  if (r.blockType === "cardio") {
    return {
      type: "cardio" as const,
      id: r.id,
      orderIndex: r.orderIndex,
      activityName: r.activityName ?? "",
      ...group,
    };
  }
  if (r.blockType === "mobility") {
    const targets: PlannedMobilityTargets = {
      ...(r.targetSets != null ? { sets: r.targetSets } : {}),
      ...(extra.holdSec ? { holdSec: extra.holdSec } : {}),
      ...(extra.reps ? { reps: extra.reps } : {}),
    };
    return {
      type: "mobility" as const,
      id: r.id,
      orderIndex: r.orderIndex,
      drillName: r.exerciseName ?? "",
      ...(r.exerciseId ? { drillId: r.exerciseId } : {}),
      metric: extra.metric === "reps" ? "reps" : "hold",
      perSide: !!extra.perSide,
      ...(Object.keys(targets).length ? { targets } : {}),
      ...group,
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
    ...group,
  };
}

export function createSqliteSplitRepo(): SplitRepo {
  return {
    async saveSplit(split: WorkoutSplit): Promise<void> {
      const db = getDb();
      // Use the caller's timestamp, don't stamp our own nowMs() here. Live edits already
      // arrive pre-stamped by touchSplit() (usecases/Splits/saveSplit.ts calls it before this),
      // so that's a no-op either way — but pullAndMergeSplits() calls this too, passing the
      // split exactly as pulled from the server. Overwriting *that* with "now" made every
      // pulled split look freshly-locally-edited, which is what let a later, blocks-stripped
      // pushAllSplits() (see that fix) always win the next last-write-wins comparison.
      const updatedAt = split.updatedAtMs ?? nowMs();

      await db.run(
        `
        INSERT INTO splits(id, name, archived, created_at_ms, updated_at_ms, owner_id, schedule)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          archived=excluded.archived,
          updated_at_ms=excluded.updated_at_ms,
          schedule=excluded.schedule
        `,
        [
          split.id,
          split.name,
          split.archived ? 1 : 0,
          split.createdAtMs,
          updatedAt,
          getActiveOwnerId(),
          split.schedule ?? null,
        ],
      );

      await db.run(`DELETE FROM split_days WHERE split_id = ?`, [split.id]);

      for (const day of split.days) {
        await db.run(
          `INSERT INTO split_days(id, split_id, order_index, name, groups_json, schedule_json) VALUES(?, ?, ?, ?, ?, ?)`,
          [
            day.id,
            split.id,
            day.orderIndex,
            day.name ?? null,
            day.groups?.length ? JSON.stringify(day.groups) : null,
            dayScheduleJson(day),
          ],
        );

        for (const block of day.blocks) {
          const row = plannedBlockRow(block);
          if (!row) continue;
          await db.run(
            `
            INSERT INTO planned_blocks(
              id, day_id, block_type, order_index,
              exercise_name, exercise_id,
              target_sets, target_reps, target_weight,
              activity_name, extra_json
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              block.id,
              day.id,
              block.type,
              block.orderIndex,
              row.name,
              row.refId,
              row.sets,
              row.reps,
              row.weight,
              row.activityName,
              row.extra ? JSON.stringify(row.extra) : null,
            ],
          );
        }
      }
    },

    async getSplit(id: string): Promise<WorkoutSplit | null> {
      const db = getDb();

      const ownerId = getActiveOwnerId();
      const splitRes = await db.query(
        `
        SELECT id, name, archived, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs, schedule
        FROM splits
        WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)
        `,
        [id, ownerId],
      );

      const base = (splitRes.values?.[0] as any) ?? null;
      if (!base) return null;

      const daysRes = await db.query(
        `
        SELECT id, order_index as orderIndex, name, groups_json as groupsJson, schedule_json as scheduleJson
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
            activity_name as activityName, extra_json as extraJson
          FROM planned_blocks
          WHERE day_id = ?
          ORDER BY order_index ASC
          `,
          [d.id],
        );

        const blocks: PlannedBlock[] = ((blocksRes.values ?? []) as any[]).map(plannedBlockFromRow);
        const groups = parseJson<PlannedGroup[]>(d.groupsJson);

        days.push({
          id: d.id,
          orderIndex: d.orderIndex,
          name: d.name ?? undefined,
          blocks,
          ...(groups?.length ? { groups } : {}),
          ...daySchedule(d.scheduleJson),
        });
      }

      return {
        id: base.id,
        name: base.name,
        archived: !!base.archived,
        createdAtMs: base.createdAtMs,
        updatedAtMs: base.updatedAtMs,
        days,
        ...(base.schedule === "weekdays" ? { schedule: "weekdays" as const } : {}),
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
        SELECT id, name, archived, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs, schedule
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
        `SELECT id, split_id as splitId, order_index as orderIndex, name, schedule_json as scheduleJson
         FROM split_days
         WHERE split_id IN (${placeholders})
         ORDER BY order_index ASC`,
        splitIds,
      );

      const daysBySplitId = new Map<string, SplitDay[]>();
      for (const d of (daysRes.values ?? []) as any[]) {
        const list = daysBySplitId.get(d.splitId) ?? [];
        list.push({ id: d.id, orderIndex: d.orderIndex, name: d.name ?? undefined, blocks: [], ...daySchedule(d.scheduleJson) });
        daysBySplitId.set(d.splitId, list);
      }

      return splitRows.map((r) => ({
        id: r.id,
        name: r.name,
        archived: !!r.archived,
        createdAtMs: r.createdAtMs,
        updatedAtMs: r.updatedAtMs,
        days: daysBySplitId.get(r.id) ?? [],
        ...(r.schedule === "weekdays" ? { schedule: "weekdays" as const } : {}),
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
