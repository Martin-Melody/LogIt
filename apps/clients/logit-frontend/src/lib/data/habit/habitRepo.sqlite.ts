import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { HabitRepo, ListEntriesOptions } from "@logit/core/data/habitRepo";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

function parse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function createSqliteHabitRepo(): HabitRepo {
  const owner = () => getActiveOwnerId();

  async function saveHabitRow(habit: Habit): Promise<void> {
    const db = getDb();
    await db.run(
      `INSERT INTO habits(id, owner_id, data_json, updated_at_ms, deleted_at_ms)
       VALUES(?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json,
         updated_at_ms = excluded.updated_at_ms, deleted_at_ms = NULL`,
      [habit.id, owner(), JSON.stringify(habit), habit.updatedAtMs],
    );
  }

  async function saveEntryRow(entry: HabitEntry): Promise<void> {
    const db = getDb();
    // Enforce one entry per (owner, habit, day): reuse an existing row's id.
    const existing = await db.query(
      `SELECT id FROM habit_entries
       WHERE (owner_id = ? OR owner_id IS NULL) AND habit_id = ? AND date_iso = ? AND deleted_at_ms IS NULL`,
      [owner(), entry.habitId, entry.dateIso],
    );
    const id = ((existing.values?.[0] as { id?: string } | undefined)?.id) ?? entry.id;
    const row = { ...entry, id };
    await db.run(
      `INSERT INTO habit_entries(id, owner_id, habit_id, date_iso, data_json, updated_at_ms, deleted_at_ms)
       VALUES(?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json,
         updated_at_ms = excluded.updated_at_ms, deleted_at_ms = NULL`,
      [row.id, owner(), row.habitId, row.dateIso, JSON.stringify(row), row.updatedAtMs],
    );
  }

  return {
    async listHabits(opts) {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM habits
         WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
         ORDER BY updated_at_ms ASC`,
        [owner()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<Habit>(r.data_json))
        .filter((h): h is Habit => h !== null && (opts?.includeArchived || !h.archived))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async getHabit(id) {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM habits WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)`,
        [id, owner()],
      );
      const row = res.values?.[0] as { data_json: string } | undefined;
      return row ? parse<Habit>(row.data_json) : null;
    },

    saveHabit: saveHabitRow,

    async archiveHabit(id) {
      const db = getDb();
      const res = await db.query(`SELECT data_json FROM habits WHERE id = ?`, [id]);
      const h = parse<Habit>((res.values?.[0] as { data_json?: string })?.data_json ?? "");
      if (h) await saveHabitRow({ ...h, archived: true, updatedAtMs: Date.now() });
    },

    async unarchiveHabit(id) {
      const db = getDb();
      const res = await db.query(`SELECT data_json FROM habits WHERE id = ?`, [id]);
      const h = parse<Habit>((res.values?.[0] as { data_json?: string })?.data_json ?? "");
      if (h) await saveHabitRow({ ...h, archived: false, updatedAtMs: Date.now() });
    },

    async deleteHabit(id) {
      const db = getDb();
      const now = Date.now();
      await db.run(`UPDATE habits SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`, [now, now, id]);
      await db.run(
        `UPDATE habit_entries SET deleted_at_ms = ?, updated_at_ms = ? WHERE habit_id = ? AND deleted_at_ms IS NULL`,
        [now, now, id],
      );
    },

    async listEntries(opts?: ListEntriesOptions) {
      const db = getDb();
      const clauses = ["(owner_id = ? OR owner_id IS NULL)", "deleted_at_ms IS NULL"];
      const params: unknown[] = [owner()];
      if (opts?.habitId) { clauses.push("habit_id = ?"); params.push(opts.habitId); }
      if (opts?.fromIso) { clauses.push("date_iso >= ?"); params.push(opts.fromIso); }
      if (opts?.toIso) { clauses.push("date_iso <= ?"); params.push(opts.toIso); }
      const res = await db.query(
        `SELECT data_json FROM habit_entries WHERE ${clauses.join(" AND ")}`,
        params,
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<HabitEntry>(r.data_json))
        .filter((e): e is HabitEntry => e !== null);
    },

    async getEntry(habitId, dateIso) {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM habit_entries
         WHERE (owner_id = ? OR owner_id IS NULL) AND habit_id = ? AND date_iso = ? AND deleted_at_ms IS NULL`,
        [owner(), habitId, dateIso],
      );
      const row = res.values?.[0] as { data_json: string } | undefined;
      return row ? parse<HabitEntry>(row.data_json) : null;
    },

    saveEntry: saveEntryRow,

    async deleteEntry(id) {
      const db = getDb();
      const now = Date.now();
      await db.run(`UPDATE habit_entries SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`, [now, now, id]);
    },

    async upsertHabitFromRemote(h) {
      await saveHabitRow(h);
    },
    async removeHabitFromRemote(id) {
      const db = getDb();
      const now = Date.now();
      await db.run(`UPDATE habits SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`, [now, now, id]);
    },
    async upsertEntryFromRemote(e) {
      await saveEntryRow(e);
    },
    async removeEntryFromRemote(id) {
      const db = getDb();
      const now = Date.now();
      await db.run(`UPDATE habit_entries SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`, [now, now, id]);
    },
    async listHabitsForPush() {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json, deleted_at_ms FROM habits WHERE owner_id = ? OR owner_id IS NULL`,
        [owner()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<Habit>(r.data_json))
        .filter((h): h is Habit => h !== null);
    },
    async listEntriesForPush() {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM habit_entries WHERE owner_id = ? OR owner_id IS NULL`,
        [owner()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<HabitEntry>(r.data_json))
        .filter((e): e is HabitEntry => e !== null);
    },
  };
}
