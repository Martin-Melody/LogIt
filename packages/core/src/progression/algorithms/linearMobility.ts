import type { AlgorithmPreferencesField } from "../../domain/progression";
import type {
  MobilityProgressionAlgorithm,
  MobilityProgressionInput,
  MobilityNextStep,
  MobilityProgressionOutput,
  MobilitySetRecord,
  SuggestedMobilitySet,
} from "../../domain/mobilityProgression";

/**
 * Progress (id linear-mobility): the default mobility algorithm.
 *
 * Builds each body area up to about 10 minutes of stretching a week (all its drills together),
 * where flexibility gains top out (Ingram et al. 2024, Sports Medicine). Below that, holds get
 * longer and reps go up as described below. Past it, holds and reps stay as they are and the
 * drill moves on instead (MobilityNextStep): load if it takes load (loaded full-range work
 * builds range about as well as stretching, Alizadeh et al. 2023), else the next harder cue on
 * the same drill, and harder drills, else the person picks one. How intense the stretch felt
 * didn't change results in that review, so the depth rating no longer gates progress by
 * default. Martin's review of the drill links: docs/mobility-progressions-draft.md.
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
type LinearMobilityState = {
  streak: Record<string, SideStreak>;
  /** Harder cues taken on so far (the next one is harderCues[cueStep]). */
  cueStep?: number;
  /** "Not yet" this week: no next step until the week after (Monday's date). */
  declinedWeek?: string;
  /** Drills the person picked as this one's next step (for drills the catalog has none for). */
  picked?: { id?: string; name: string }[];
};

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
  areaWeeklySec: number;
  startLoadKg: number;
};

const DEFAULT_PREFERENCES: LinearMobilityPreferences = {
  startHoldSec: 20,
  holdIncrementSec: 5,
  maxHoldSec: 120,
  repFloor: 8,
  repCeiling: 15,
  repIncrement: 1,
  loadIncrementKg: 2.5,
  minDepthToProgress: 0,
  setsPerSide: 3,
  areaWeeklySec: 600,
  startLoadKg: 5,
};

const PREFERENCES_SCHEMA: AlgorithmPreferencesField[] = [
  { key: "startHoldSec", label: "Starting hold", description: "Hold time to prescribe for a brand-new drill.", type: "number", default: 20, min: 5, max: 120, step: 5, unit: "s" },
  { key: "holdIncrementSec", label: "Hold increment", description: "Seconds to add when you meet the target on every set.", type: "number", default: 5, min: 1, max: 30, step: 1, unit: "s" },
  { key: "maxHoldSec", label: "Hold soft cap", description: "Past this, stop adding time and start adding load or a harder variant.", type: "number", default: 120, min: 20, max: 600, step: 10, unit: "s" },
  { key: "repFloor", label: "Rep floor", description: "Reps to reset to after a load increase.", type: "number", default: 8, min: 1, max: 30, step: 1, unit: "reps" },
  { key: "repCeiling", label: "Rep ceiling", description: "Hit this on every set to trigger a load increase.", type: "number", default: 15, min: 2, max: 50, step: 1, unit: "reps" },
  { key: "repIncrement", label: "Rep increment", description: "Reps to add each session you meet the target.", type: "number", default: 1, min: 1, max: 5, step: 1, unit: "reps" },
  { key: "loadIncrementKg", label: "Load increment", description: "Load to add when you hit the rep ceiling on a loaded drill.", type: "number", default: 2.5, min: 0.25, max: 20, step: 0.25, unit: "kg" },
  { key: "minDepthToProgress", label: "Minimum depth", description: "Hold time won't advance until your logged depth rating averages at least this. 0 (the default) turns the gate off.", type: "number", default: 0, min: 0, max: 5, step: 1 },
  { key: "areaWeeklySec", label: "Weekly time per area", description: "Past this much stretching for an area in a week, holds stop growing and the drill moves on (load, a harder cue, a harder drill).", type: "number", default: 600, min: 120, max: 3600, step: 60, unit: "s" },
  { key: "startLoadKg", label: "First load", description: "Load suggested the first time a drill that takes load moves on.", type: "number", default: 5, min: 0.5, max: 40, step: 0.5, unit: "kg" },
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
    areaWeeklySec: num(p.areaWeeklySec, DEFAULT_PREFERENCES.areaWeeklySec),
    startLoadKg: num(p.startLoadKg, DEFAULT_PREFERENCES.startLoadKg),
  };
}

function readState(raw: unknown): LinearMobilityState {
  const s = (raw ?? {}) as Partial<LinearMobilityState>;
  return {
    streak: s.streak && typeof s.streak === "object" ? { ...s.streak } : {},
    ...(typeof s.cueStep === "number" ? { cueStep: s.cueStep } : {}),
    ...(typeof s.declinedWeek === "string" ? { declinedWeek: s.declinedWeek } : {}),
    ...(Array.isArray(s.picked) ? { picked: s.picked } : {}),
  };
}

/** Monday of `ms`'s week, local time, as YYYY-MM-DD. */
export function mobilityWeekOf(ms: number): string {
  const d = new Date(ms);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SIDE_LABEL: Record<string, string> = { left: " L", right: " R", both: "" };

function setsForSide(entry: { sets: MobilitySetRecord[] } | undefined, sideKey: string): MobilitySetRecord[] {
  if (!entry) return [];
  const mine = entry.sets.filter((s) => (sideKey === "both" ? !s.side : s.side === sideKey));
  // Logged without sides (imported, or before the drill was per side): those count for each side.
  if (mine.length === 0 && sideKey !== "both" && entry.sets.every((s) => !s.side)) return entry.sets;
  return mine;
}

function bestNumber(vals: (number | undefined)[]): number {
  const nums = vals.filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0);
  return nums.length ? Math.max(...nums) : 0;
}

function avgDepth(sets: MobilitySetRecord[]): number {
  const ds = sets.map((s) => s.depth).filter((d): d is number => typeof d === "number" && d > 0);
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
}

/**
 * Holds come off a stopwatch (34s, 37s…), so the next goal is snapped to a
 * 5-second step: every drill gets a clean, comparable target instead of
 * whatever second the timer happened to stop on. A sub-5s increment keeps
 * 1-second steps so it can still progress.
 */
function roundHold(v: number, incrementSec: number): number {
  const step = incrementSec >= 5 ? 5 : 1;
  return Math.max(5, Math.round(v / step) * step);
}

function suggest(input: MobilityProgressionInput): MobilityProgressionOutput {
  const p = prefs(input.userPreferences);
  const state = readState(input.state);
  const last = input.history[0];
  const sideKeys = input.drill.perSide ? ["left", "right"] : ["both"];
  const isHold = input.drill.metric === "hold";
  // The area has its weekly time: hold steady and move on (see the top of the file).
  const areaDone = !!input.areaWeek && input.areaWeek.doneSec >= p.areaWeeklySec;

  const sets: SuggestedMobilitySet[] = [];
  const nextStreak: Record<string, SideStreak> = { ...state.streak };
  const labelParts: string[] = [];
  const noteParts: string[] = [];
  let seeded = 0;

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
      seeded++;
      labelParts.push(`${isHold ? `${p.startHoldSec} s` : `${p.repFloor} reps`}${SIDE_LABEL[sideKey] ?? ""}`);
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

      const lastLoad = bestNumber(lastSets.map((s) => s.loadKg));
      let nextHold: number;
      if (areaDone) {
        nextHold = roundHold(lastBest, p.holdIncrementSec);
        nextStreak[sideKey] = prevStreak;
      } else if (metTarget && depthOK) {
        nextHold = roundHold(Math.min(p.maxHoldSec, lastBest + p.holdIncrementSec), p.holdIncrementSec);
        nextStreak[sideKey] = { hits: prevStreak.hits + 1, misses: 0 };
        if (lastBest + p.holdIncrementSec > p.maxHoldSec) {
          noteParts.push(`You're past ${p.maxHoldSec}s${SIDE_LABEL[sideKey] ?? ""} — add load or move to a harder variant.`);
        }
      } else if (!depthOK) {
        nextHold = roundHold(lastBest, p.holdIncrementSec);
        noteParts.push(`Depth was light${SIDE_LABEL[sideKey] ?? ""} — build into the stretch before adding time.`);
      } else if (prevStreak.misses + 1 >= DELOAD_AFTER_MISSES) {
        nextHold = roundHold(lastBest * DELOAD_FACTOR, p.holdIncrementSec);
        nextStreak[sideKey] = { hits: 0, misses: 0 };
        noteParts.push(`Backing off${SIDE_LABEL[sideKey] ?? ""} after two misses.`);
      } else {
        nextHold = roundHold(lastBest, p.holdIncrementSec);
        nextStreak[sideKey] = { hits: 0, misses: prevStreak.misses + 1 };
      }
      target = lastLoad > 0 ? { durationSec: nextHold, loadKg: lastLoad } : { durationSec: nextHold };
      labelParts.push(`${lastBest}s→${nextHold}s${SIDE_LABEL[sideKey] ?? ""}`);
    } else {
      // Reps metric.
      const workingReps = bestNumber(lastSets.map((s) => s.reps));
      const workingLoad = bestNumber(lastSets.map((s) => s.loadKg));
      const hitCeiling = workingReps >= p.repCeiling;

      let nextReps: number;
      let nextLoad = workingLoad;
      if (areaDone) {
        nextReps = workingReps;
        nextStreak[sideKey] = prevStreak;
      } else if (hitCeiling && workingLoad > 0) {
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

  // The harder cue being worked on, as a reminder on the drill.
  const cues = input.progression?.harderCues ?? [];
  const cueStep = state.cueStep ?? 0;
  if (cueStep > 0 && cues[cueStep - 1]) noteParts.unshift(`Cue: ${cues[cueStep - 1]}.`);

  const next = areaDone && input.areaWeek && state.declinedWeek !== mobilityWeekOf(input.now)
    ? nextStep(input, p, state, sets)
    : undefined;

  return {
    sets,
    nextState: {
      streak: nextStreak,
      ...(state.cueStep ? { cueStep: state.cueStep } : {}),
      ...(state.declinedWeek ? { declinedWeek: state.declinedWeek } : {}),
      ...(state.picked ? { picked: state.picked } : {}),
    } satisfies LinearMobilityState,
    // Nothing to compare with on a first go, so no "Last →" (bug hunt 13.13).
    label: !labelParts.length ? undefined
      : seeded === sideKeys.length ? `First time: aim ${labelParts.join(" · ")}`
      : `Last → next: ${labelParts.join(" · ")}`,
    notes: noteParts.length ? noteParts.join(" ") : undefined,
    ...(next ? { next } : {}),
  };
}

/** Load, else the next harder cue and harder drills, else "pick one". Neck drills never. */
function nextStep(
  input: MobilityProgressionInput,
  p: LinearMobilityPreferences,
  state: LinearMobilityState,
  sets: SuggestedMobilitySet[],
): MobilityNextStep | undefined {
  const areaWeek = { area: input.areaWeek!.area, doneSec: input.areaWeek!.doneSec, targetSec: p.areaWeeklySec };
  const prog = input.progression;
  if (prog?.steady) return undefined;
  if (prog?.takesLoad) {
    const now = bestNumber(sets.map((s) => s.loadKg));
    return { areaWeek, load: { kg: now > 0 ? now + p.loadIncrementKg : p.startLoadKg } };
  }
  const cues = prog?.harderCues ?? [];
  const step = state.cueStep ?? 0;
  const seen = new Set<string>();
  const harder = [...(prog?.harder ?? []), ...(state.picked ?? []).map((d) => ({ id: d.id ?? "", name: d.name }))]
    .filter((d) => !seen.has(d.name) && seen.add(d.name));
  return {
    areaWeek,
    ...(step < cues.length ? { cue: { text: cues[step]!, step: step + 1, of: cues.length } } : {}),
    ...(harder.length ? { harder } : { pickHarder: true }),
  };
}

export const linearMobility: MobilityProgressionAlgorithm = {
  id: "linear-mobility",
  name: "Progress",
  description:
    "Holds get longer and reps go up until an area has about 10 minutes a week, where flexibility gains top out. Then each drill moves on: load, a harder version of the same stretch, or a harder stretch.",
  author: "LogIt",
  defaultState: DEFAULT_STATE,
  defaultPreferences: DEFAULT_PREFERENCES,
  preferencesSchema: PREFERENCES_SCHEMA,
  suggest,
};
