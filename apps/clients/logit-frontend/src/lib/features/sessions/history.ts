import { writable, get } from "svelte/store";
import type { WorkoutSession, StrengthBlockData, MobilityBlockData } from "@logit/core/domain/workout";
import { mobilitySetGroups } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { MuscleGroup } from "@logit/core/domain/exercise";
import {
  compareSessions,
  historyPRs,
  inferSplitDay,
  sessionTitle,
  type HistoryPR,
  type MusclesOf,
  type SessionComparison,
} from "@logit/core/domain/sessionHistory";
import { getExerciseRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { listSplits } from "$lib/usecases/Splits/listSplits";
import { loadVolumeContext, sessionVolumeKg, type VolumeContext } from "$lib/features/bodyweight/bodyweight";
import { trainedDayIso } from "$lib/features/goals/streak";

/** One workout as the Sessions pages show it. */
export type HistoryEntry = {
  session: WorkoutSession;
  title: string;
  /** What it's called without the user's own name. */
  autoTitle: string;
  /** The split or program it came from (or looks like it came from); null for others. */
  parentName: string | null;
  comparison: SessionComparison | undefined;
  prs: HistoryPR[];
  volumeKg: number;
  /** Logged strength sets plus drill rounds done. */
  setCount: number;
  /** Exercises, drills and activities. */
  itemCount: number;
  /** Local calendar day, YYYY-MM-DD. */
  dayIso: string;
  inProgress: boolean;
};

export type History = {
  /** Newest first; a running workout first of all. */
  entries: HistoryEntry[];
  byId: Map<string, HistoryEntry>;
  splits: WorkoutSplit[];
  volumeCtx: VolumeContext | null;
  musclesOf: MusclesOf;
};

function loggedSetCount(s: WorkoutSession): number {
  let n = 0;
  for (const b of s.blocks) {
    if (b.type === "strength") n += (b.data as StrengthBlockData).sets.filter((x) => x.reps > 0 || x.completed).length;
    else if (b.type === "mobility") {
      n += mobilitySetGroups(b.data as MobilityBlockData).filter((g) =>
        g.kind === "single"
          ? g.set.completed || (g.set.durationSec ?? 0) > 0 || (g.set.reps ?? 0) > 0
          : [g.left, g.right].some((x) => x && (x.completed || (x.durationSec ?? 0) > 0 || (x.reps ?? 0) > 0)),
      ).length;
    }
  }
  return n;
}

export function buildHistory(
  sessions: WorkoutSession[],
  splits: WorkoutSplit[],
  musclesOf: MusclesOf,
  volumeCtx: VolumeContext | null,
): History {
  const comparisons = compareSessions(sessions);
  const prs = historyPRs(sessions);
  const entries: HistoryEntry[] = sessions.map((session) => {
    const inferred = session.source ? null : inferSplitDay(session, splits);
    const autoTitle = sessionTitle({ ...session, name: null }, { musclesOf, inferredDayName: inferred?.dayName });
    return {
      session,
      title: session.name?.trim() || autoTitle,
      autoTitle,
      parentName: session.source?.parentName ?? inferred?.split.name ?? null,
      comparison: comparisons.get(session.id),
      prs: prs.get(session.id) ?? [],
      volumeKg: sessionVolumeKg(session, volumeCtx),
      setCount: loggedSetCount(session),
      itemCount: session.blocks.filter((b) => b.type === "strength" || b.type === "cardio" || b.type === "mobility").length,
      dayIso: trainedDayIso(session),
      inProgress: session.endedAtMs == null,
    };
  });
  entries.sort((a, b) =>
    a.inProgress !== b.inProgress ? (a.inProgress ? -1 : 1) : b.session.startedAtMs - a.session.startedAtMs,
  );
  return { entries, byId: new Map(entries.map((e) => [e.session.id, e])), splits, volumeCtx, musclesOf };
}

async function loadMusclesOf(): Promise<MusclesOf> {
  const exercises = await getExerciseRepo().list({ limit: 10_000 }).catch(() => []);
  const byId = new Map<string, MuscleGroup[]>();
  const byName = new Map<string, MuscleGroup[]>();
  for (const e of exercises) {
    byId.set(e.id, e.primaryMuscles ?? []);
    byName.set(e.name.trim().toLowerCase(), e.primaryMuscles ?? []);
  }
  return (id, name) => (id ? byId.get(id) : undefined) ?? byName.get(name.trim().toLowerCase());
}

async function loadHistory(): Promise<History> {
  const [sessions, splits, musclesOf, volumeCtx] = await Promise.all([
    getWorkoutRepo().listAllSessions(),
    listSplits().catch(() => [] as WorkoutSplit[]),
    loadMusclesOf(),
    loadVolumeContext().catch(() => null),
  ]);
  return buildHistory(sessions, splits, musclesOf, volumeCtx);
}

/**
 * Every workout with its name, comparison and PRs. The last load shows straight away
 * while `refresh` reloads, so going list → session → back doesn't flash.
 */
function createHistoryStore() {
  const store = writable<History | null>(null);
  let pending: Promise<History> | null = null;
  return {
    subscribe: store.subscribe,
    refresh(): Promise<History> {
      pending ??= loadHistory()
        .then((h) => {
          store.set(h);
          return h;
        })
        .finally(() => (pending = null));
      return pending;
    },
    /** The loaded history, else a load. */
    async ensure(): Promise<History> {
      return get(store) ?? this.refresh();
    },
    clear() {
      store.set(null);
    },
  };
}

export const sessionHistory = createHistoryStore();
