import type { AssignedProgramRepo } from "@logit/core/data/coachProgramRepo";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function parse(json: string): CoachProgram | null {
  try {
    return JSON.parse(json) as CoachProgram;
  } catch {
    return null;
  }
}

function activeKey(): string {
  return `active_program_id:${getActiveOwnerId() ?? "default"}`;
}

/** Native (SQLite) mirror of coach-assigned programs. Read-only for the user; the only
 * writers are the sync loop's merge helpers. */
export function createSqliteCoachProgramRepo(): AssignedProgramRepo {
  return {
    async listAssignedPrograms(): Promise<CoachProgram[]> {
      const db = getDb();
      const ownerId = getActiveOwnerId();
      const res = await db.query(
        `SELECT data_json FROM coach_programs
         WHERE owner_id = ? OR owner_id IS NULL
         ORDER BY updated_at_ms DESC`,
        [ownerId],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse(r.data_json))
        .filter((p): p is CoachProgram => p !== null && !p.archived);
    },

    async getAssignedProgram(id: string): Promise<CoachProgram | null> {
      const db = getDb();
      const ownerId = getActiveOwnerId();
      const res = await db.query(
        `SELECT data_json FROM coach_programs
         WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)`,
        [id, ownerId],
      );
      const row = (res.values?.[0] as { data_json: string } | undefined) ?? null;
      return row ? parse(row.data_json) : null;
    },

    async getActiveProgramId(): Promise<string | null> {
      const db = getDb();
      const res = await db.query(`SELECT value FROM meta WHERE key = ?`, [activeKey()]);
      const v = ((res.values?.[0] as { value?: string } | undefined)?.value ?? "").trim();
      return v ? v : null;
    },

    async setActiveProgramId(id: string | null): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO meta(key, value) VALUES(?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [activeKey(), id ?? ""],
      );
    },

    async upsertFromRemote(program: CoachProgram): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO coach_programs(id, owner_id, data_json, updated_at_ms, synced_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           synced_at_ms = excluded.synced_at_ms`,
        [program.id, getActiveOwnerId(), JSON.stringify(program), program.updatedAtMs, nowMs()],
      );
    },

    async removeFromRemote(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM coach_programs WHERE id = ?`, [id]);
      if ((await this.getActiveProgramId()) === id) await this.setActiveProgramId(null);
    },
  };
}
