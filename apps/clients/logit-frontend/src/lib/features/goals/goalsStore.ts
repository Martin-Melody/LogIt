import { writable, get } from "svelte/store";
import { createId } from "@logit/core/domain/ids";
import { createGoal, mergeGoals, type Goal, type GoalTarget } from "@logit/core/domain/goals";
import {
  clampWeeklyTarget,
  DEFAULT_WEEKLY_TARGET,
  type StreakPause,
  type TargetChange,
} from "@logit/core/domain/weeklyStreak";
import { weekStartIso } from "@logit/core/domain/dateIso";
import { localDateIso } from "@logit/core/domain/nutrition";
import { getActiveOwnerId, onActiveOwnerChange } from "$lib/data/activeOwner";

/**
 * The lifter's goals and weekly streak settings, per local account in localStorage. They
 * sync on the profile (`goalsJson`), merged per goal and kept newest-wins on both the
 * server and here, like the split rotation, so two devices editing different goals don't
 * undo each other. Deleted goals stay as tombstones so the delete syncs too.
 */

export type StreakSettings = {
  weeklyTarget: number;
  /** When the target changed, so past weeks keep the target they had. */
  targetHistory?: TargetChange[];
  pauses: StreakPause[];
  updatedAtMs: number;
};

export type GoalsState = {
  goals: Goal[];
  streak: StreakSettings;
};

/** The synced shape: one flat map so the server can merge it key by key on `updatedAtMs`. */
type RemoteGoals = Record<string, (Goal | StreakSettings) & { updatedAtMs: number }>;
const STREAK_KEY = "streak";

function defaults(): GoalsState {
  return { goals: [], streak: { weeklyTarget: DEFAULT_WEEKLY_TARGET, pauses: [], updatedAtMs: 0 } };
}

function storageKey(): string {
  return `logit:goals:v1:${getActiveOwnerId() ?? "local"}`;
}

function read(): GoalsState {
  if (typeof localStorage === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<GoalsState>;
    const d = defaults();
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      streak: { ...d.streak, ...(parsed.streak ?? {}) },
    };
  } catch {
    return defaults();
  }
}

function write(state: GoalsState) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    // Storage blocked: goals just won't persist on this device.
  }
}

function schedulePush() {
  void import("$lib/sync/syncService").then((m) => m.pushNavConfig()).catch(() => {});
}

function createGoalsStore() {
  const store = writable<GoalsState>(read());

  function commit(next: GoalsState, push = true) {
    write(next);
    store.set(next);
    if (push) schedulePush();
  }

  return {
    subscribe: store.subscribe,
    reload() {
      store.set(read());
    },
    add(target: GoalTarget, deadlineIso?: string | null): Goal {
      const goal = createGoal(target, { id: createId("goal"), nowMs: Date.now(), deadlineIso });
      const s = read();
      commit({ ...s, goals: [...s.goals, goal] });
      return goal;
    },
    update(id: string, patch: { target?: GoalTarget; deadlineIso?: string | null }) {
      const s = read();
      commit({
        ...s,
        goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAtMs: Date.now() } : g)),
      });
    },
    remove(id: string) {
      const s = read();
      const now = Date.now();
      commit({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, deletedAtMs: now, updatedAtMs: now } : g)) });
    },
    setWeeklyTarget(n: number) {
      const s = read();
      const target = clampWeeklyTarget(n);
      const thisWeek = weekStartIso(localDateIso());
      // First change: everything before it keeps the old target.
      const history = s.streak.targetHistory?.length
        ? s.streak.targetHistory
        : [{ fromIso: "0000-01-01", target: s.streak.weeklyTarget }];
      // A change applies from this week on; changing it twice in a week keeps the last.
      const targetHistory = [...history.filter((c) => c.fromIso !== thisWeek), { fromIso: thisWeek, target }];
      commit({ ...s, streak: { ...s.streak, weeklyTarget: target, targetHistory, updatedAtMs: Date.now() } });
    },
    /** Pause from today until `endIso` (inclusive), or open-ended. */
    startPause(endIso: string | null = null) {
      const s = read();
      const today = localDateIso();
      // Replace an open or future pause rather than stacking them.
      const pauses = s.streak.pauses.filter((p) => p.endIso != null && p.endIso < today);
      pauses.push({ id: createId("pause"), startIso: today, endIso });
      commit({ ...s, streak: { ...s.streak, pauses, updatedAtMs: Date.now() } });
    },
    /** End the current pause yesterday, so today counts again. */
    endPause() {
      const s = read();
      const today = localDateIso();
      const yesterday = localDateIso(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const pauses = s.streak.pauses
        .map((p) => (p.startIso <= today && (p.endIso == null || p.endIso >= today) ? { ...p, endIso: yesterday } : p))
        // A pause started today and ended at once never covered anything.
        .filter((p) => p.endIso == null || p.endIso >= p.startIso);
      commit({ ...s, streak: { ...s.streak, pauses, updatedAtMs: Date.now() } });
    },
    applyRemote(remote: RemoteGoals) {
      const s = read();
      const remoteGoals: Goal[] = [];
      let remoteStreak: StreakSettings | null = null;
      for (const [key, value] of Object.entries(remote ?? {})) {
        if (!value || typeof value.updatedAtMs !== "number") continue;
        if (key === STREAK_KEY) remoteStreak = value as StreakSettings;
        else if ((value as Goal).target) remoteGoals.push({ ...(value as Goal), id: key });
      }
      const streak =
        remoteStreak && remoteStreak.updatedAtMs > s.streak.updatedAtMs
          ? {
              weeklyTarget: clampWeeklyTarget(remoteStreak.weeklyTarget),
              targetHistory: remoteStreak.targetHistory ?? [],
              pauses: remoteStreak.pauses ?? [],
              updatedAtMs: remoteStreak.updatedAtMs,
            }
          : s.streak;
      commit({ goals: mergeGoals(s.goals, remoteGoals), streak }, false);
    },
  };
}

export const goalsStore = createGoalsStore();
onActiveOwnerChange(() => goalsStore.reload());

/** Live goals (not deleted). */
export function activeGoals(state: GoalsState): Goal[] {
  return state.goals.filter((g) => !g.deletedAtMs);
}

/** For the synced profile: null when there's nothing worth sending. */
export function getGoalsJson(): string | null {
  const s = get(goalsStore);
  if (s.goals.length === 0 && s.streak.updatedAtMs === 0) return null;
  const out: RemoteGoals = {};
  for (const g of s.goals) out[g.id] = g;
  if (s.streak.updatedAtMs > 0) out[STREAK_KEY] = s.streak;
  return JSON.stringify(out);
}
