import type { AlgorithmPreferencesField } from "@logit/core/domain/progression";
import type {
  MobilityProgressionAlgorithm,
  MobilityProgressionInput,
  MobilityProgressionOutput,
  MobilitySetRecord,
  SuggestedMobilitySet,
} from "@logit/core/domain/mobilityProgression";

/**
 * Linear mobility progression — treat a stretch like a lift.
 *
 *  - Hold drills: add a few seconds of time-under-tension each session you meet
 *    the target, hold steady when you miss, back off ~10% after two misses,
 *    soft-cap the hold and nudge toward loading once you're deep enough.
 *  - Rep drills: add a rep until the ceiling, then add load and reset reps
 *    (or, for bodyweight drills, keep adding reps and suggest adding load).
 *  - Per-side drills progress each side on its own streak — a tight left hip
 *    doesn't hold the right one back.
 */

type SideStreak = { hits: number; misses: number };
type LinearMobilityState = { streak: Record<string, SideStreak> };

type LinearMobilityPreferences = {
  startHoldSec: number;
  holdIncrementSec: number;
  maxHoldSec: number;
  repFloor: number;
  repCeiling: number;
  repIncrement: number;
  loadIncrementKg: number;
  minDepthToProgress: number;
  setsPerSide: number;
};

const DEFAULT_PREFERENCES: LinearMobilityPreferences = {
  startHoldSec: 20,
  holdIncrementSec: 5,
  maxHoldSec: 120,
  repFloor: 8,
  repCeiling: 15,
  repIncrement: 1,
  loadIncrementKg: 2.5,
  minDepthToProgress: 3,
  setsPerSide: 3,
};

const PREFERENCES_SCHEMA: AlgorithmPreferencesField[] = [
  { key: "startHoldSec", label: "Starting hold", description: "Hold time to prescribe for a brand-new drill.", type: "number", default: 20, min: 5, max: 120, step: 5, unit: "s" },
  { key: "holdIncrementSec", label: "Hold increment", description: "Seconds to add when you meet the target on every set.", type: "number", default: 5, min: 1, max: 30, step: 1, unit: "s" },
  { key: "maxHoldSec", label: "Hold soft cap", description: "Past this, stop adding time and start adding load or a harder variant.", type: "number", default: 120, min: 20, max: 600, step: 10, unit: "s" },
  { key: "repFloor", label: "Rep floor", description: "Reps to reset to after a load increase.", type: "number", default: 8, min: 1, max: 30, step: 1, unit: "reps" },
  { key: "repCeiling", label: "Rep ceiling", description: "Hit this on every set to trigger a load increase.", type: "number", default: 15, min: 2, max: 50, step: 1, unit: "reps" },
  { key: "repIncrement", label: "Rep increment", description: "Reps to add each session you meet the target.", type: "number", default: 1, min: 1, max: 5, step: 1, unit: "reps" },
  { key: "loadIncrementKg", label: "Load increment", description: "Load to add when you hit the rep ceiling on a loaded drill.", type: "number", default: 2.5, min: 0.25, max: 20, step: 0.25, unit: "kg" },
  { key: "minDepthToProgress", label: "Minimum depth", description: "Hold time won't advance until your logged depth rating averages at least this. 0 disables the gate.", type: "number", default: 3, min: 0, max: 5, step: 1 },
  { key: "setsPerSide", label: "Sets per side", description: "How many sets to prescribe (per side for unilateral drills).", type: "number", default: 3, min: 1, max: 6, step: 1, unit: "sets" },
];

const DEFAULT_STATE: LinearMobilityState = { streak: {} };
const DELOAD_AFTER_MISSES = 2;
const DELOAD_FACTOR = 0.9;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

function prefs(raw: unknown): LinearMobilityPreferences {
  const p = (raw ?? {}) as Partial<LinearMobilityPreferences>;
  return {
    startHoldSec: num(p.startHoldSec, DEFAULT_PREFERENCES.startHoldSec),
    holdIncrementSec: num(p.holdIncrementSec, DEFAULT_PREFERENCES.holdIncrementSec),
    maxHoldSec: num(p.maxHoldSec, DEFAULT_PREFERENCES.maxHoldSec),
    repFloor: num(p.repFloor, DEFAULT_PREFERENCES.repFloor),
    repCeiling: num(p.repCeiling, DEFAULT_PREFERENCES.repCeiling),
    repIncrement: num(p.repIncrement, DEFAULT_PREFERENCES.repIncrement),
    loadIncrementKg: num(p.loadIncrementKg, DEFAULT_PREFERENCES.loadIncrementKg),
    minDepthToProgress: num(p.minDepthToProgress, DEFAULT_PREFERENCES.minDepthToProgress),
    setsPerSide: Math.max(1, Math.round(num(p.setsPerSide, DEFAULT_PREFERENCES.setsPerSide))),
  };
}

function readState(raw: unknown): LinearMobilityState {
  const s = (raw ?? {}) as Partial<LinearMobilityState>;
  return { streak: s.streak && typeof s.streak === "object" ? { ...s.streak } : {} };
}

const SIDE_LABEL: Record<string, string> = { left: " L", right: " R", both: "" };

function setsForSide(entry: { sets: MobilitySetRecord[] } | undefined, sideKey: string): MobilitySetRecord[] {
  if (!entry) return [];
  return entry.sets.filter((s) => (sideKey === "both" ? !s.side : s.side === sideKey));
}

function bestNumber(vals: (number | undefined)[]): number {
  const nums = vals.filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0);
  return nums.length ? Math.max(...nums) : 0;
}

function avgDepth(sets: MobilitySetRecord[]): number {
  const ds = sets.map((s) => s.depth).filter((d): d is number => typeof d === "number" && d > 0);
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
}

function roundHold(v: number): number {
  return Math.max(5, Math.round(v));
}

function suggest(input: MobilityProgressionInput): MobilityProgressionOutput {
  const p = prefs(input.userPreferences);
  const state = readState(input.state);
  const last = input.history[0];
  const sideKeys = input.drill.perSide ? ["left", "right"] : ["both"];
  const isHold = input.drill.metric === "hold";

  const sets: SuggestedMobilitySet[] = [];
  const nextStreak: Record<string, SideStreak> = { ...state.streak };
  const labelParts: string[] = [];
  const noteParts: string[] = [];

  for (const sideKey of sideKeys) {
    const prevStreak = state.streak[sideKey] ?? { hits: 0, misses: 0 };
    const lastSets = setsForSide(last, sideKey);
    const historyBest = isHold
      ? bestNumber(input.history.flatMap((h) => setsForSide(h, sideKey).map((s) => s.durationSec)))
      : bestNumber(input.history.flatMap((h) => setsForSide(h, sideKey).map((s) => s.reps)));

    let target: SuggestedMobilitySet;

    if (lastSets.length === 0) {
      // No history for this side — seed a conservative prescription.
      target = isHold
        ? { durationSec: p.startHoldSec }
        : { reps: p.repFloor, loadKg: 0 };
      nextStreak[sideKey] = { hits: 0, misses: 0 };
      labelParts.push(
        isHold
          ? `${p.startHoldSec}s${SIDE_LABEL[sideKey] ?? ""}`
          : `${p.repFloor}×${SIDE_LABEL[sideKey] ?? ""}`.replace("× ", "×"),
      );
    } else if (isHold) {
      const lastBest = bestNumber(lastSets.map((s) => s.durationSec));
      const lastTargets = lastSets
        .map((s) => s.targetSec)
        .filter((t): t is number => typeof t === "number" && t > 0);
      const metTarget = lastTargets.length
        ? lastSets.every((s) => (s.durationSec ?? 0) >= (s.targetSec ?? 0))
        : lastBest >= historyBest;
      const depth = avgDepth(lastSets);
      const depthOK = p.minDepthToProgress <= 0 || depth === 0 || depth >= p.minDepthToProgress;

      let nextHold: number;
      if (metTarget && depthOK) {
        nextHold = roundHold(Math.min(p.maxHoldSec, lastBest + p.holdIncrementSec));
        nextStreak[sideKey] = { hits: prevStreak.hits + 1, misses: 0 };
        if (lastBest + p.holdIncrementSec > p.maxHoldSec) {
          noteParts.push(`You're past ${p.maxHoldSec}s${SIDE_LABEL[sideKey] ?? ""} — add load or move to a harder variant.`);
        }
      } else if (!depthOK) {
        nextHold = roundHold(lastBest);
        noteParts.push(`Depth was light${SIDE_LABEL[sideKey] ?? ""} — build into the stretch before adding time.`);
      } else if (prevStreak.misses + 1 >= DELOAD_AFTER_MISSES) {
        nextHold = roundHold(lastBest * DELOAD_FACTOR);
        nextStreak[sideKey] = { hits: 0, misses: 0 };
        noteParts.push(`Backing off${SIDE_LABEL[sideKey] ?? ""} after two misses.`);
      } else {
        nextHold = roundHold(lastBest);
        nextStreak[sideKey] = { hits: 0, misses: prevStreak.misses + 1 };
      }
      target = { durationSec: nextHold };
      labelParts.push(`${lastBest}s→${nextHold}s${SIDE_LABEL[sideKey] ?? ""}`);
    } else {
      // Reps metric.
      const workingReps = bestNumber(lastSets.map((s) => s.reps));
      const workingLoad = bestNumber(lastSets.map((s) => s.loadKg));
      const hitCeiling = workingReps >= p.repCeiling;

      let nextReps: number;
      let nextLoad = workingLoad;
      if (hitCeiling && workingLoad > 0) {
        nextLoad = workingLoad + p.loadIncrementKg;
        nextReps = p.repFloor;
        nextStreak[sideKey] = { hits: prevStreak.hits + 1, misses: 0 };
      } else if (hitCeiling) {
        nextReps = workingReps + p.repIncrement;
        nextStreak[sideKey] = { hits: prevStreak.hits + 1, misses: 0 };
        noteParts.push(`Past ${p.repCeiling} reps${SIDE_LABEL[sideKey] ?? ""} — add load to keep overloading.`);
      } else {
        nextReps = Math.min(p.repCeiling, workingReps + p.repIncrement);
        nextStreak[sideKey] = { hits: prevStreak.hits + 1, misses: 0 };
      }
      target = nextLoad > 0 ? { reps: nextReps, loadKg: nextLoad } : { reps: nextReps };
      const was = workingLoad > 0 ? `${workingReps}×${workingLoad}kg` : `${workingReps} reps`;
      const now = nextLoad > 0 ? `${nextReps}×${nextLoad}kg` : `${nextReps} reps`;
      labelParts.push(`${was}→${now}${SIDE_LABEL[sideKey] ?? ""}`);
    }

    for (let i = 0; i < p.setsPerSide; i++) {
      sets.push(sideKey === "both" ? { ...target } : { ...target, side: sideKey as "left" | "right" });
    }
  }

  return {
    sets,
    nextState: { streak: nextStreak } satisfies LinearMobilityState,
    label: labelParts.length ? `Last → next: ${labelParts.join(" · ")}` : undefined,
    notes: noteParts.length ? noteParts.join(" ") : undefined,
  };
}

export const linearMobility: MobilityProgressionAlgorithm = {
  id: "linear-mobility",
  name: "Linear mobility",
  description:
    "Adds time-under-tension or reps/load each session you meet the target, per side, with a depth gate and a soft cap that nudges toward loading.",
  author: "Logit",
  defaultState: DEFAULT_STATE,
  defaultPreferences: DEFAULT_PREFERENCES,
  preferencesSchema: PREFERENCES_SCHEMA,
  suggest,
};
