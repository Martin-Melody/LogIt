import { browser } from "$app/environment";
import type {
  WorkoutRepo,
  ListRecentSessionsOptions,
} from "$lib/data/workoutRepo";
import type { WorkoutSession } from "$lib/domain/workout";
import type { SetTypeOption } from "./types";

const STORAGE_KEYS = {
  sessions: "logit:sessions:v1",
  draft: "logit:draft:v1",
} as const;

function ensureBrowser(): void {
  if (!browser) {
    throw new Error("localStorage repo cannot be used during SSR.");
  }
}

function migrateSession(raw: any): WorkoutSession {
  if (Array.isArray(raw.blocks)) return raw as WorkoutSession;
  return {
    id: raw.id,
    startedAtMs: raw.startedAtMs,
    endedAtMs: raw.endedAtMs,
    blocks: (raw.exercises ?? []).map((ex: any) => ({
      id: ex.id,
      type: "strength",
      orderIndex: ex.orderIndex ?? 0,
      data: {
        exerciseName: ex.exerciseName ?? "",
        exerciseId: ex.exerciseId ?? undefined,
        sets: ex.sets ?? [],
      },
    })),
  };
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

function sortByMostRecent(a: WorkoutSession, b: WorkoutSession): number {
  const aTime = a.endedAtMs ?? a.startedAtMs;
  const bTime = b.endedAtMs ?? b.startedAtMs;
  return bTime - aTime;
}

export function createLocalWorkoutRepo(): WorkoutRepo {
  return {
    async saveSession(session: WorkoutSession): Promise<void> {
      const sessions = readJson<WorkoutSession[]>(STORAGE_KEYS.sessions, []);

      const next = sessions.some((s) => s.id === session.id)
        ? sessions.map((s) => (s.id === session.id ? session : s))
        : [...sessions, session];

      next.sort(sortByMostRecent);

      writeJson(STORAGE_KEYS.sessions, next);
    },

    async getSession(id: string): Promise<WorkoutSession | null> {
      const sessions = readJson<any[]>(STORAGE_KEYS.sessions, []);
      const raw = sessions.find((s) => s.id === id);
      return raw ? migrateSession(raw) : null;
    },

    async listRecentSessions(
      options: ListRecentSessionsOptions,
    ): Promise<WorkoutSession[]> {
      const sessions = readJson<any[]>(STORAGE_KEYS.sessions, []);
      const sorted = [...sessions].sort(sortByMostRecent);
      return sorted.slice(0, options.limit).map(migrateSession);
    },

    async listAllSessions(): Promise<WorkoutSession[]> {
      const sessions = readJson<any[]>(STORAGE_KEYS.sessions, []);
      return sessions.map(migrateSession);
    },

    async deleteSession(id: string): Promise<void> {
      const sessions = readJson<WorkoutSession[]>(STORAGE_KEYS.sessions, []);
      const next = sessions.filter((s) => s.id !== id);
      writeJson(STORAGE_KEYS.sessions, next);
    },

    async clearAllSessions(): Promise<void> {
      writeJson(STORAGE_KEYS.sessions, []);
    },

    async saveDraftSession(session: WorkoutSession): Promise<void> {
      writeJson(STORAGE_KEYS.draft, session);
    },

    async loadDraftSession(): Promise<WorkoutSession | null> {
      const draft = readJson<any | null>(STORAGE_KEYS.draft, null);
      return draft ? migrateSession(draft) : null;
    },

    async clearDraftSession(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.draft);
    },

    async getSetTypes(): Promise<SetTypeOption[]> {
      return [
        { id: "normal", code: "normal", label: "Normal" },
        { id: "warmup", code: "warmup", label: "Warm-up" },
        { id: "dropset", code: "dropset", label: "Drop set" },
        { id: "amrap", code: "amrap", label: "AMRAP" },
        { id: "failure", code: "failure", label: "To failure" },
      ];
    },
  };
}
