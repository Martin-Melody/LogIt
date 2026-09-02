import { browser } from "$app/environment";
import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { HabitRepo, ListEntriesOptions } from "@logit/core/data/habitRepo";

const HABITS_KEY = "logit:habits:v1";
const ENTRIES_KEY = "logit:habitEntries:v1";

type Tombstoned = { deletedAtMs?: number; updatedAtMs: number };

function read<T>(key: string): Record<string, T> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}
function write<T>(key: string, map: Record<string, T>): void {
  if (browser) localStorage.setItem(key, JSON.stringify(map));
}
function live<T extends Tombstoned>(key: string): T[] {
  return Object.values(read<T>(key)).filter((v) => !v.deletedAtMs);
}
function tombstone(key: string, id: string): void {
  const map = read<Tombstoned>(key);
  const row = map[id];
  if (!row) return;
  const now = Date.now();
  map[id] = { ...row, deletedAtMs: now, updatedAtMs: now };
  write(key, map);
}

export function createLocalHabitRepo(): HabitRepo {
  return {
    async listHabits(opts) {
      return live<Habit & Tombstoned>(HABITS_KEY)
        .filter((h) => opts?.includeArchived || !h.archived)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async getHabit(id) {
      return read<Habit>(HABITS_KEY)[id] ?? null;
    },

    async saveHabit(habit) {
      const map = read<Habit>(HABITS_KEY);
      map[habit.id] = { ...habit, updatedAtMs: Date.now() };
      write(HABITS_KEY, map);
    },

    async archiveHabit(id) {
      const map = read<Habit>(HABITS_KEY);
      if (map[id]) {
        map[id] = { ...map[id]!, archived: true, updatedAtMs: Date.now() };
        write(HABITS_KEY, map);
      }
    },

    async deleteHabit(id) {
      tombstone(HABITS_KEY, id);
      // also tombstone its entries
      const entries = read<HabitEntry & Tombstoned>(ENTRIES_KEY);
      const now = Date.now();
      for (const [eid, e] of Object.entries(entries)) {
        if (e.habitId === id && !e.deletedAtMs) {
          entries[eid] = { ...e, deletedAtMs: now, updatedAtMs: now };
        }
      }
      write(ENTRIES_KEY, entries);
    },

    async listEntries(opts?: ListEntriesOptions) {
      return live<HabitEntry & Tombstoned>(ENTRIES_KEY).filter((e) => {
        if (opts?.habitId && e.habitId !== opts.habitId) return false;
        if (opts?.fromIso && e.dateIso < opts.fromIso) return false;
        if (opts?.toIso && e.dateIso > opts.toIso) return false;
        return true;
      });
    },

    async getEntry(habitId, dateIso) {
      return (
        live<HabitEntry & Tombstoned>(ENTRIES_KEY).find(
          (e) => e.habitId === habitId && e.dateIso === dateIso,
        ) ?? null
      );
    },

    async saveEntry(entry) {
      const map = read<HabitEntry>(ENTRIES_KEY);
      // one entry per (habit, day)
      const existing = Object.values(map).find(
        (e) => e.habitId === entry.habitId && e.dateIso === entry.dateIso,
      );
      const id = existing?.id ?? entry.id;
      map[id] = { ...entry, id, updatedAtMs: Date.now() };
      write(ENTRIES_KEY, map);
    },

    async deleteEntry(id) {
      tombstone(ENTRIES_KEY, id);
    },

    // ── sync surface (real impl lands with sync) ──
    async upsertHabitFromRemote(h) {
      const map = read<Habit & Tombstoned>(HABITS_KEY);
      const cur = map[h.id];
      if (!cur || h.updatedAtMs >= cur.updatedAtMs) map[h.id] = h;
      write(HABITS_KEY, map);
    },
    async removeHabitFromRemote(id) {
      tombstone(HABITS_KEY, id);
    },
    async upsertEntryFromRemote(e) {
      const map = read<HabitEntry & Tombstoned>(ENTRIES_KEY);
      const cur = map[e.id];
      if (!cur || e.updatedAtMs >= cur.updatedAtMs) map[e.id] = e;
      write(ENTRIES_KEY, map);
    },
    async removeEntryFromRemote(id) {
      tombstone(ENTRIES_KEY, id);
    },
    async listHabitsForPush() {
      return Object.values(read<Habit & Tombstoned>(HABITS_KEY));
    },
    async listEntriesForPush() {
      return Object.values(read<HabitEntry & Tombstoned>(ENTRIES_KEY));
    },
  };
}
