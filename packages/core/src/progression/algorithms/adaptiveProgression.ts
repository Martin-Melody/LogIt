import type {
  AlgorithmPreferencesField,
  ExerciseHistoryEntry,
  ProgressionAlgorithm,
  ProgressionChange,
  ProgressionInput,
  ProgressionOutput,
  SuggestedSet,
} from "../../domain/progression";
import type { MuscleGroup } from "../../domain/exercise";
import { usesBodyweightLoad } from "../../domain/exercise";
import type { Reasoning, ReasoningConfidence } from "../../domain/reasoning";
import { estimated1RM } from "../../domain/oneRepMax";
import { nowMs } from "../../domain/time";
import { MAX_FATIGUE_DISCOUNT, calibrateSensitivity, computeFatigueScore } from "../fatigue";
import { linearProgression } from "./linearProgression";

// LogIt Adaptive: every working set is planned from a current strength estimate, not from
// last session's sets. The estimate is the best estimated 1RM (Epley) from the last few
// sessions, so one off day doesn't drag it down and light back-off sets don't count
// against it. Today's weight is the heaviest that fits the exercise's rep range at the
// chosen effort, and the reps per set allow for how much this lifter's reps usually drop
// from one set to the next. Beating the planned reps raises the estimate, so the weight
// follows on its own; there's no separate "add 2.5 kg" rule.
//
// Bodyweight-relative and assisted exercises can't be planned from a 1RM without knowing
// bodyweight, so they're handed to Linear Progression.

type AdaptivePreferences = {
  compoundRepMin: number;
  compoundRepMax: number;
  isolationRepMin: number;
  isolationRepMax: number;
  /** Reps left in the tank on each set. 0 = close to failure. */
  repsInReserve: number;
  workingSets: number;
  increment: number;
};

const DEFAULT_PREFERENCES: AdaptivePreferences = {
  compoundRepMin: 5,
  compoundRepMax: 8,
  isolationRepMin: 8,
  isolationRepMax: 12,
  repsInReserve: 0,
  workingSets: 3,
  increment: 2.5,
};

const PREFERENCES_SCHEMA: AlgorithmPreferencesField[] = [
  { key: "compoundRepMin", label: "Big lifts: fewest reps", description: "Bench, squat, rows and other lifts that work several muscles.", type: "number", default: 5, min: 1, max: 30, step: 1, unit: "reps" },
  { key: "compoundRepMax", label: "Big lifts: most reps", type: "number", default: 8, min: 1, max: 40, step: 1, unit: "reps" },
  { key: "isolationRepMin", label: "Single-muscle lifts: fewest reps", description: "Curls, raises, extensions and other lifts that work one muscle.", type: "number", default: 8, min: 1, max: 30, step: 1, unit: "reps" },
  { key: "isolationRepMax", label: "Single-muscle lifts: most reps", type: "number", default: 12, min: 1, max: 40, step: 1, unit: "reps" },
  {
    key: "repsInReserve",
    label: "How hard",
    description: "How many reps to leave in the tank on each set.",
    type: "select",
    default: 0,
    options: [
      { value: 0, label: "Close to failure" },
      { value: 1, label: "1 rep left" },
      { value: 2, label: "2 reps left" },
      { value: 3, label: "3 reps left" },
    ],
  },
  { key: "workingSets", label: "Working sets", description: "When your split day doesn't say.", type: "number", default: 3, min: 1, max: 10, step: 1, unit: "sets" },
  { key: "increment", label: "Smallest weight step", description: "Weights are rounded to this. An exercise's machine overrides it.", type: "number", default: 2.5, min: 0.25, max: 20, step: 0.25, unit: "kg" },
];

type AdaptiveState = {
  /** The estimate behind the last plan, for the record. */
  estimateKg?: number;
  /** State for Linear Progression, which plans bodyweight and assisted exercises. */
  linear?: unknown;
};

const DAY_MS = 86_400_000;
/** Sessions the estimate looks back over, and how far back at most. */
const ESTIMATE_SESSIONS = 4;
const ESTIMATE_WINDOW_MS = 42 * DAY_MS;
/** After this long without training it, the estimate is taken 5% lower. */
const LAYOFF_MS = 21 * DAY_MS;
const LAYOFF_FACTOR = 0.95;
/** Epley is unreliable past this many reps, so longer sets count as this many. */
const MAX_REPS_FOR_ESTIMATE = 15;
const DEFAULT_SET_DROP = 1;
const MIN_DROP_SAMPLES = 4;

function workingSetsOf(entry: ExerciseHistoryEntry) {
  return entry.sets
    .filter((s) => (s.setType === "normal" || !s.setType) && s.reps > 0 && s.weight > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readPreferences(raw: unknown): AdaptivePreferences {
  const p = (raw ?? {}) as Partial<Record<keyof AdaptivePreferences, unknown>>;
  const d = DEFAULT_PREFERENCES;
  return {
    compoundRepMin: num(p.compoundRepMin, d.compoundRepMin),
    compoundRepMax: num(p.compoundRepMax, d.compoundRepMax),
    isolationRepMin: num(p.isolationRepMin, d.isolationRepMin),
    isolationRepMax: num(p.isolationRepMax, d.isolationRepMax),
    repsInReserve: Math.max(0, Math.min(5, num(p.repsInReserve, d.repsInReserve))),
    workingSets: Math.max(1, num(p.workingSets, d.workingSets)),
    increment: num(p.increment, d.increment) > 0 ? num(p.increment, d.increment) : d.increment,
  };
}

/** A lift that works three or more muscles counts as a big (compound) lift. */
export function isCompound(exercise: ProgressionInput["exercise"]): boolean {
  const muscles = new Set<MuscleGroup>([...(exercise.primaryMuscles ?? []), ...(exercise.secondaryMuscles ?? [])]);
  return muscles.size >= 3;
}

function roundTo(weight: number, step: number): number {
  return Math.max(0, Math.round(weight / step + 1e-9) * step);
}

function fmtKg(kg: number): string {
  return `${Math.round(kg * 100) / 100} kg`;
}

function whenLabel(ms: number, now: number): string {
  const days = Math.floor((now - ms) / DAY_MS);
  const d = new Date(ms);
  if (days <= 0) return "today";
  if (days < 7) return `on ${d.toLocaleDateString("en-GB", { weekday: "long" })}`;
  return `on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export type StrengthEstimate = {
  kg: number;
  /** The set it came from. */
  from: { weight: number; reps: number; performedAtMs: number; left?: number };
  sessionsConsidered: number;
  layoff: boolean;
};

/**
 * The current strength estimate: the best Epley 1RM from the most recent few sessions
 * within six weeks of the newest one, lowered 5% after three weeks off. Null when there are
 * no loaded working sets to read. `history` is newest first.
 */
export function strengthEstimate(history: ExerciseHistoryEntry[], now: number): StrengthEstimate | null {
  const newest = history[0];
  if (!newest) return null;
  const recent = history
    .filter((h) => h.performedAtMs >= newest.performedAtMs - ESTIMATE_WINDOW_MS)
    .slice(0, ESTIMATE_SESSIONS);
  let best: StrengthEstimate | null = null;
  for (const h of recent) {
    for (const s of workingSetsOf(h)) {
      // "2 left" after a set means two more were there, so they count (at most 3). Without
      // this, doing exactly the planned reps kept the estimate, and the plan, where it was.
      const left = s.rpe != null ? Math.min(3, Math.max(0, 10 - s.rpe)) : 0;
      const kg = estimated1RM(s.weight, Math.min(s.reps + left, MAX_REPS_FOR_ESTIMATE));
      if (!best || kg > best.kg) {
        best = { kg, from: { weight: s.weight, reps: s.reps, performedAtMs: h.performedAtMs, ...(left ? { left } : {}) }, sessionsConsidered: recent.length, layoff: false };
      }
    }
  }
  if (!best) return null;
  if (now - newest.performedAtMs > LAYOFF_MS) best = { ...best, kg: best.kg * LAYOFF_FACTOR, layoff: true };
  return best;
}

/**
 * How many reps this lifter usually loses from one set to the next at the same weight,
 * from their history; 1 until there are enough same-weight pairs to tell. Rounded to the
 * nearest half rep, 0–3.
 */
export function setToSetDrop(history: ExerciseHistoryEntry[]): { drop: number; samples: number; learned: boolean } {
  const drops: number[] = [];
  for (const h of history) {
    const sets = workingSetsOf(h);
    for (let i = 1; i < sets.length; i++) {
      if (Math.abs(sets[i]!.weight - sets[i - 1]!.weight) < 0.01) drops.push(sets[i - 1]!.reps - sets[i]!.reps);
    }
  }
  if (drops.length < MIN_DROP_SAMPLES) return { drop: DEFAULT_SET_DROP, samples: drops.length, learned: false };
  const mean = drops.reduce((a, b) => a + b, 0) / drops.length;
  return { drop: Math.max(0, Math.min(3, Math.round(mean * 2) / 2)), samples: drops.length, learned: true };
}

function suggest(input: ProgressionInput): ProgressionOutput | Promise<ProgressionOutput> {
  const prefs = readPreferences(input.userPreferences);
  const state = (input.state ?? {}) as AdaptiveState;
  const now = nowMs();
  const step = input.incrementOverride ?? prefs.increment;

  const compound = isCompound(input.exercise);
  const plannedReps = input.plannedTargets?.reps && input.plannedTargets.reps > 0 ? input.plannedTargets.reps : undefined;
  // A split day's reps win on that day, then the lifter's own range for this exercise,
  // then the big-lift / single-muscle default.
  const [lo, hi]: [number, number] = plannedReps
    ? [plannedReps, plannedReps]
    : input.repRange
      ? [input.repRange[0], Math.max(input.repRange[0], input.repRange[1])]
      : compound
      ? [prefs.compoundRepMin, Math.max(prefs.compoundRepMin, prefs.compoundRepMax)]
      : [prefs.isolationRepMin, Math.max(prefs.isolationRepMin, prefs.isolationRepMax)];
  const plannedSets = input.plannedTargets?.sets && input.plannedTargets.sets > 0 ? input.plannedTargets.sets : undefined;

  // Weights relative to bodyweight, and assistance: Linear Progression plans those.
  const bwLoad = usesBodyweightLoad(input.exercise.exerciseType, input.history.flatMap((h) => h.sets.map((s) => s.weight)));
  if (input.exercise.exerciseType === "assisted" || bwLoad) {
    return Promise.resolve(
      linearProgression.suggest({
        ...input,
        state: state.linear ?? null,
        userPreferences: { repRangeMin: lo, repRangeMax: hi, workingSets: plannedSets ?? prefs.workingSets, increment: prefs.increment, suggestionDetail: "block" },
      }),
    ).then((out) => ({
      ...out,
      nextState: { ...state, linear: out.nextState } satisfies AdaptiveState,
      reasoning: out.reasoning
        ? { ...out.reasoning, summary: ["Planned the simple way: weights relative to bodyweight can't be worked out from a 1-rep max.", ...(out.reasoning.summary ?? [])] }
        : out.reasoning,
    }));
  }

  const estimate = strengthEstimate(input.history, now);
  const last = input.history[0];
  const lastWorking = last ? workingSetsOf(last) : [];
  const setCount = plannedSets ?? Math.max(prefs.workingSets, Math.min(lastWorking.length, 6));

  if (!estimate) {
    const weight = input.plannedTargets?.weight ?? 0;
    return {
      sets: Array.from({ length: setCount }, () => ({ reps: [lo, hi] as [number, number], weight, setType: "normal" as const })),
      nextState: state,
      displayMode: "summary",
      change: {
        kind: "first",
        text: "First time",
        detail: lo === hi ? `Pick a weight you can do ${lo} reps with.` : `Pick a weight you can do ${lo}–${hi} reps with.`,
      },
      reasoning: {
        inputs: { historySessions: input.history.length },
        computed: {},
        confidence: "low",
        verdict: "nothing logged to plan from yet",
        summary: ["Nothing logged for this exercise yet. After this session every set is planned from what you lift."],
      },
    };
  }

  const rir = prefs.repsInReserve;
  const drop = setToSetDrop(input.history);
  // The first set aims high enough that, losing `drop` reps a set, the last set still
  // lands in the range.
  const firstReps = Math.min(hi, lo + Math.max(lo === hi ? 0 : 1, Math.round(drop.drop * (setCount - 1))));
  // Reps the estimate supports at a weight, at the chosen effort.
  const repsAt = (w: number) => (w > 0 ? Math.floor(30 * (estimate.kg / w - 1) + 1e-9) - rir : 0);
  let topWeight = roundTo(estimate.kg / (1 + (firstReps + rir) / 30), step);
  // Rounded up past what the estimate lifts for the range's fewest reps: a step lighter.
  if (topWeight > step && repsAt(topWeight) < lo) topWeight -= step;
  // The reps the estimate supports at the weight there is, so the plan moves before the weight
  // can (dumbbells in 2.5s). While the next step up is out of reach (12.5 → 15 kg is a 20% jump)
  // a couple over the top of the range keeps it moving until the jump fits.
  const cap = repsAt(topWeight + step) >= lo ? hi : hi + 2;
  const aimReps = Math.max(lo, Math.min(cap, repsAt(topWeight)));

  // Today's session: trim for muscles already worked, but only once there's enough history
  // to know how much this lifter's reps actually drop when tired.
  const preceding = input.sessionContext?.precedingExercises ?? [];
  const fatigueScore = computeFatigueScore((input.exercise.primaryMuscles ?? []) as MuscleGroup[], preceding);
  const calibration = calibrateSensitivity(input.history, hi);
  const discount = calibration.calibrated ? fatigueScore * MAX_FATIGUE_DISCOUNT * calibration.sensitivity : 0;
  const fatigued = discount > 0 ? roundTo(topWeight * (1 - discount), step) : topWeight;
  // Behind on a lift goal and asked to push: the first set goes one weight step heavier.
  const pushGoal = input.goal?.pace === "behind" && input.goal.behindPace === "push";

  const sets: SuggestedSet[] = [];
  let dropped = false;
  const startWeight = fatigued;
  for (let i = 0; i < setCount; i++) {
    const reps = Math.round(aimReps - drop.drop * i);
    if (reps >= lo) {
      sets.push({ reps, weight: i === 0 && pushGoal ? startWeight + step : startWeight, setType: "normal" });
    } else {
      // A set that would fall under the range keeps the bottom rep count and gets lighter:
      // one weight step for each rep it would have been short.
      dropped = true;
      sets.push({ reps: lo, weight: Math.max(0, startWeight - step * (lo - reps)), setType: "normal" });
    }
  }

  // How today compares with last time's heaviest working set.
  const lastTop = lastWorking.length > 0 ? Math.max(...lastWorking.map((s) => s.weight)) : null;
  const diff = lastTop === null ? 0 : startWeight - lastTop;
  const change: ProgressionChange =
    lastTop === null || Math.abs(diff) < 0.01
      ? { kind: "reps", text: "Same weight", detail: `From your strength estimate of ${fmtKg(Math.round(estimate.kg))}.` }
      : diff > 0
        ? { kind: "increase", text: `+${fmtKg(diff)}`, detail: `Your strength estimate is up to ${fmtKg(Math.round(estimate.kg))}.` }
        : {
            kind: "deload",
            text: `−${fmtKg(-diff)}`,
            detail: discount > 0
              ? "Lighter because the same muscles are already worked today."
              : `Your strength estimate is ${fmtKg(Math.round(estimate.kg))}; recent sessions were lighter.`,
          };

  const rangeText = lo === hi ? `${lo} reps` : `${lo}–${hi} reps`;
  const effortText = rir === 0 ? "close to failure" : `with ${rir} ${rir === 1 ? "rep" : "reps"} left in the tank`;
  const lightSets = lastWorking.filter((s) => s.weight < topWeight * 0.9);
  const summary = [
    `Your strength estimate is ${fmtKg(Math.round(estimate.kg))}, from ${fmtKg(estimate.from.weight).replace(" kg", "")} × ${estimate.from.reps}${estimate.from.left ? ` with ${estimate.from.left} left` : ""} ${whenLabel(estimate.from.performedAtMs, now)}.`,
    ...(estimate.layoff ? ["It's been over three weeks since you trained this, so the estimate is taken 5% lower."] : []),
    `For ${rangeText} ${effortText}, that's about ${fmtKg(topWeight)}.`,
    drop.learned
      ? `Your reps usually drop by about ${drop.drop} a set, so the sets aim for ${sets.map((s) => s.reps).join(", ")}.`
      : `Reps usually drop about 1 a set as you tire, so the sets aim for ${sets.map((s) => s.reps).join(", ")}. This becomes your own number after a few more sessions.`,
    ...(dropped ? [`A set that would fall under ${lo} reps comes down a little in weight instead.`] : []),
    ...(discount > 0
      ? [`${Math.round(discount * 100)}% lighter today because earlier exercises already worked the same muscles, going by how your reps drop when you do this later in a workout.`]
      : []),
    ...(lightSets.length > 0
      ? [`Last time's ${[...new Set(lightSets.map((s) => fmtKg(s.weight)))].join(" and ")} ${lightSets.length === 1 ? "set was" : "sets were"} well under what you can do for ${rangeText}, so ${lightSets.length === 1 ? "it doesn't" : "they don't"} set today's weights.`]
      : []),
    ...(pushGoal ? [`You're behind on your goal and asked to push, so the first set is ${fmtKg(step)} heavier.`] : []),
    `Beat these reps and the estimate goes up; the weight follows next time.`,
  ];

  const confidence: ReasoningConfidence =
    estimate.sessionsConsidered >= 3 && drop.learned ? "high" : estimate.sessionsConsidered >= 2 ? "medium" : "low";

  const reasoning: Reasoning = {
    inputs: {
      historySessions: input.history.length,
      estimateFrom: `${estimate.from.weight} × ${estimate.from.reps}`,
      sessionsInEstimate: estimate.sessionsConsidered,
      repRange: `${lo}-${hi}`,
      bigLift: compound,
      repsInReserve: rir,
      setDropLearned: drop.learned,
      precedingExercisesThisSession: preceding.length,
      fatigueCalibrated: calibration.calibrated,
    },
    computed: {
      strengthEstimateKg: Math.round(estimate.kg * 10) / 10,
      firstSetReps: aimReps,
      setToSetDrop: drop.drop,
      weightBeforeFatigue: topWeight,
      fatigueDiscountPct: Math.round(discount * 100),
      suggestedWeight: startWeight,
    },
    confidence,
    verdict: "from your strength estimate",
    summary,
  };

  return {
    sets,
    nextState: { ...state, estimateKg: Math.round(estimate.kg * 10) / 10 } satisfies AdaptiveState,
    displayMode: "block",
    change,
    reasoning,
    progressGoal: { reps: aimReps },
  };
}

export const adaptiveProgression: ProgressionAlgorithm = {
  id: "logit-adaptive",
  name: "LogIt Adaptive",
  description:
    "Plans every set from your current strength, so the weight fits your rep range whatever you did last time. Big lifts aim for 5–8 reps and single-muscle lifts 8–12, close to failure. Allows for your reps dropping set to set and, once it knows you, for muscles already worked that session.",
  author: "logit",
  defaultState: {},
  defaultPreferences: DEFAULT_PREFERENCES,
  preferencesSchema: PREFERENCES_SCHEMA,
  suggest,
};
