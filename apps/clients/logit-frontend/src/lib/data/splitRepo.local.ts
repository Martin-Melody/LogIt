import { browser } from "$app/environment";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { SplitRepo, ListSplitsOptions } from "@logit/core/data/splitRepo";

const STORAGE_KEYS = {
  splits: "logit:splits:v1", // array of WorkoutSplit
  activeSplitId: "logit:activeSplitId:v1", // string
} as const;

function ensureBrowser(): void {
  if (!browser) {
    throw new Error("localStorage repo cannot be used during SSR.");
  }
}

function readJson<T>(key: string, fallback: T): T {
  ensureBrowser();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  ensureBrowser();
  localStorage.setItem(key, JSON.stringify(value));
}

function sortByMostRecentlyUpdated(a: WorkoutSplit, b: WorkoutSplit): number {
  const aTime = a.updatedAtMs ?? a.createdAtMs ?? 0;
  const bTime = b.updatedAtMs ?? b.createdAtMs ?? 0;
  return bTime - aTime;
}

export function createLocalSplitRepo(): SplitRepo {
  return {
    async saveSplit(split: WorkoutSplit): Promise<void> {
      const splits = readJson<WorkoutSplit[]>(STORAGE_KEYS.splits, []);

      const next = splits.some((s) => s.id === split.id)
        ? splits.map((s) => (s.id === split.id ? split : s))
        : [...splits, split];

      next.sort(sortByMostRecentlyUpdated);
      writeJson(STORAGE_KEYS.splits, next);
    },

    async getSplit(id: string): Promise<WorkoutSplit | null> {
      const splits = readJson<WorkoutSplit[]>(STORAGE_KEYS.splits, []);
      return splits.find((s) => s.id === id) ?? null;
    },

    async getListSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]> {
      const splits = readJson<WorkoutSplit[]>(STORAGE_KEYS.splits, []);

      let result = [...splits];

      if (!options?.includeArchived) {
        result = result.filter((s) => !s.archived);
      }

      result.sort(sortByMostRecentlyUpdated);

      if (typeof options?.offset === "number") {
        result = result.slice(options.offset);
      }

      if (typeof options?.limit === "number") {
        result = result.slice(0, options.limit);
      }

      return result;
    },

    async deleteSplit(id: string): Promise<void> {
      const splits = readJson<WorkoutSplit[]>(STORAGE_KEYS.splits, []);
      const next = splits.filter((s) => s.id !== id);
      writeJson(STORAGE_KEYS.splits, next);

      const active = readJson<string | null>(STORAGE_KEYS.activeSplitId, null);
      if (active === id) {
        ensureBrowser();
        localStorage.removeItem(STORAGE_KEYS.activeSplitId);
      }
    },

    async setActiveSplitId(id: string | null): Promise<void> {
      ensureBrowser();
      if (!id) {
        localStorage.removeItem(STORAGE_KEYS.activeSplitId);
        return;
      }
      localStorage.setItem(STORAGE_KEYS.activeSplitId, JSON.stringify(id));
    },

    async getActiveSplitId(): Promise<string | null> {
      return readJson<string | null>(STORAGE_KEYS.activeSplitId, null);
    },
  };
}
