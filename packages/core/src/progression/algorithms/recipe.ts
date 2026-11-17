import type {
  ExerciseHistoryEntry,
  ProgressionAlgorithm,
  ProgressionInput,
  ProgressionOutput,
  SuggestedSet,
} from "../../domain/progression";
import type { MuscleGroup } from "../../domain/exercise";
import { describeRecipe, recipeAlgorithmId, type ProgressionRecipe } from "../../domain/progressionRecipe";
import { adaptiveProgression, isCompound, strengthEstimate } from "./adaptiveProgression";
import { linearProgression } from "./linearProgression";
import { nowMs } from "../../domain/time";

// Runs a progression algorithm built from blocks (domain/progressionRecipe.ts). The heavy
// lifting is shared with the built-ins: "estimate" plans through LogIt Adaptive, "last"
// through Linear Progression, and "wave" is a four-week training-max wave done here. The
// blocks then shape the result: set layout, set count from the weekly muscle target, and
// holding the weight in a calorie deficit.

type RecipeState = {
  /** Linear Progression's own state, for "last". */
  linear?: unknown;
  /** "wave": training max, week of the wave (0–3), cycles done, last session applied. */
  tm?: number;
  week?: number;
  cycle?: number;
  lastAppliedSessionId?: string;
};

/** A calorie deficit worth holding for: 250 kcal a day under maintenance, over 4+ logged days. */
export const DEFICIT_KCAL = 250;

export function inDeficit(food: ProgressionInput["food"]): boolean {
  return !!food && food.daysLogged >= 4 && food.avgKcal < food.maintenanceKcal - DEFICIT_KCAL;
}

const WAVE: { pct: number[]; reps: number[]; plus: boolean; label: string }[] = [
  { pct: [0.65, 0.75, 0.85], reps: [5, 5, 5], plus: true, label: "5s" },
  { pct: [0.7, 0.8, 0.9], reps: [3, 3, 3], plus: true, label: "3s" },
  { pct: [0.75, 0.85, 0.95], reps: [5, 3, 1], plus: true, label: "5/3/1" },
  { pct: [0.4, 0.5, 0.6], reps: [5, 5, 5], plus: false, label: "light week" },
];
const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes"];

function roundTo(w: number, step: number): number {
  return Math.max(0, Math.round(w / step + 1e-9) * step);
}

function kg(n: number): string {
  return `${Math.round(n * 100) / 100} kg`;
}

function topWeight(entry: ExerciseHistoryEntry | undefined): number | null {
  const working = entry?.sets.filter((s) => (s.setType === "normal" || s.setType === "amrap" || !s.setType) && s.weight > 0) ?? [];
  return working.length ? Math.max(...working.map((s) => s.weight)) : null;
}

/** Working sets for today: the recipe's count, or the split day's, nudged by the weekly target. */
function setCountFor(recipe: ProgressionRecipe, input: ProgressionInput): { count: number; line?: string } {
  const base = input.plannedTargets?.sets && input.plannedTargets.sets > 0 ? input.plannedTargets.sets : recipe.sets.count;
  const week = input.muscleWeek;
  if (recipe.sets.mode !== "weekly" || !week) return { count: base };
  const name = week.muscle;
  if (week.done < week.lo) {
    return { count: Math.min(6, base + 1), line: `${capital(name)} is at ${fmt(week.done)} of ${week.lo}–${week.hi} sets this week, so one more set.` };
  }
  if (week.done > week.hi) {
    return { count: Math.max(2, base - 1), line: `${capital(name)} is already at ${fmt(week.done)} of ${week.lo}–${week.hi} sets this week, so one set fewer.` };
  }
  return { count: base, line: `${capital(name)} is at ${fmt(week.done)} of ${week.lo}–${week.hi} sets this week.` };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function withLines(out: ProgressionOutput, lines: (string | undefined)[], drop?: (line: string) => boolean): ProgressionOutput {
  const add = lines.filter((l): l is string => !!l);
  if (!out.reasoning) return out;
  const kept = (out.reasoning.summary ?? []).filter((l) => !drop?.(l));
  return { ...out, reasoning: { ...out.reasoning, summary: [...kept, ...add] } };
}

async function planFromEstimate(recipe: ProgressionRecipe, input: ProgressionInput, count: number): Promise<ProgressionOutput> {
  const range = input.repRange ?? recipe.repRange;
  const out = await adaptiveProgression.suggest({
    ...input,
    state: null,
    repRange: range,
    plannedTargets: { ...input.plannedTargets, sets: count },
    userPreferences: {
      repsInReserve: recipe.repsInReserve,
      workingSets: count,
      increment: recipe.increment,
    },
  });
  if (out.sets.length === 0 || recipe.setLayout === "straight" || out.change?.kind === "first") return out;

  const step = input.incrementOverride ?? recipe.increment;
  const [, hi] = String(out.reasoning?.inputs.repRange ?? "").split("-").map(Number);
  const top = out.sets[0]!;
  const topReps = typeof top.reps === "number" ? top.reps : top.reps[0];
  const sets: SuggestedSet[] =
    recipe.setLayout === "topBackoff"
      ? out.sets.map((s, i) => (i === 0 ? s : { ...s, weight: roundTo(top.weight * 0.9, step), reps: Number.isFinite(hi) ? hi! : topReps + 2 }))
      : out.sets.map((s, i) => ({ ...s, reps: topReps, weight: Math.max(0, top.weight - step * i) }));
  const line =
    recipe.setLayout === "topBackoff"
      ? `One top set at ${kg(top.weight)}, then back-off sets 10% lighter for more reps.`
      : `The same ${topReps} reps every set, ${kg(step)} lighter each time.`;
  return withLines({ ...out, sets }, [line], (l) => /reps usually drop|would fall under/i.test(l));
}

async function planFromLast(recipe: ProgressionRecipe, input: ProgressionInput, count: number, state: RecipeState): Promise<ProgressionOutput> {
  const range = input.repRange ?? recipe.repRange ?? (isCompound(input.exercise) ? [5, 8] : [8, 12]);
  // "Hold" never deloads: each session starts with no misses counted.
  const linearState = state.linear && recipe.whenStalled === "hold" ? { ...(state.linear as object), failedAttempts: 0 } : state.linear ?? null;
  const out = await linearProgression.suggest({
    ...input,
    state: linearState,
    plannedTargets: { ...input.plannedTargets, sets: count },
    userPreferences: { repRangeMin: range[0], repRangeMax: range[1], workingSets: count, increment: recipe.increment, suggestionDetail: "block" },
  });
  return {
    ...withLines(out, [recipe.whenStalled === "hold" ? "Set to hold rather than deload when you miss the range." : undefined]),
    nextState: { ...state, linear: out.nextState } satisfies RecipeState,
  };
}

function planWave(recipe: ProgressionRecipe, input: ProgressionInput, count: number, state: RecipeState): ProgressionOutput {
  const now = nowMs();
  const est = strengthEstimate(input.history, now);
  if (!est && state.tm == null) {
    return {
      sets: [],
      nextState: state,
      change: { kind: "first", text: "First time", detail: "Do a few hard sets you can count; the wave starts from what you lift." },
      reasoning: { inputs: {}, computed: {}, confidence: "low", verdict: "nothing to start the wave from yet", summary: ["The wave needs one session of this exercise to set its training max."] },
    };
  }
  const step = input.incrementOverride ?? recipe.increment;
  let tm = state.tm ?? roundTo(est!.kg * 0.9, step);
  let week = state.week ?? 0;
  let cycle = state.cycle ?? 0;
  const lines: string[] = [];
  const newest = input.history[0];
  const lower = (input.exercise.primaryMuscles ?? []).some((m) => LOWER.includes(m));
  const cycleStep = step * (lower ? 2 : 1);

  // Fold in the newest session once: did the last set reach its reps? Then move on a week.
  if (newest && state.tm != null && state.lastAppliedSessionId !== newest.sessionId) {
    const plan = WAVE[week]!;
    const sets = newest.sets.filter((s) => s.setType !== "warmup" && s.weight > 0);
    const last = sets[sets.length - 1];
    const missed = plan.plus && last != null && last.reps < plan.reps[plan.reps.length - 1]!;
    if (missed && recipe.whenStalled === "deload") {
      tm = roundTo(tm * 0.9, step);
      week = 0;
      lines.push(`Last time's final set came up short, so the training max goes 10% down to ${kg(tm)} and the wave starts again.`);
    } else {
      week = (week + 1) % WAVE.length;
      if (week === 0) {
        cycle += 1;
        if (recipe.food === "diary" && inDeficit(input.food)) {
          lines.push("New cycle, but you're eating under maintenance, so the training max stays put.");
        } else {
          tm += cycleStep;
          lines.push(`New cycle: training max up ${kg(cycleStep)} to ${kg(tm)}.`);
        }
      }
    }
  }

  const plan = WAVE[week]!;
  const sets: SuggestedSet[] = plan.pct.map((p, i) => ({
    reps: plan.reps[i]!,
    weight: roundTo(tm * p, step),
    setType: plan.plus && i === plan.pct.length - 1 ? ("amrap" as const) : ("normal" as const),
    ...(plan.plus && i === plan.pct.length - 1 ? { note: `${plan.reps[i]}+: as many as you can` } : {}),
  }));
  // More sets than the wave's three: extra back-off sets at the first set's weight.
  for (let i = sets.length; i < count; i++) sets.push({ reps: plan.reps[0]!, weight: sets[0]!.weight, setType: "normal" });

  const pcts = plan.pct.map((p) => `${Math.round(p * 100)}%`).join(", ");
  return {
    sets,
    nextState: { ...state, tm, week, cycle, lastAppliedSessionId: newest?.sessionId } satisfies RecipeState,
    displayMode: "block",
    change: { kind: "reps", text: `Week ${week + 1}: ${plan.label}`, detail: `Training max ${kg(tm)}.` },
    progressGoal: plan.plus ? { reps: plan.reps[plan.reps.length - 1]! } : undefined,
    reasoning: {
      inputs: { week: week + 1, cycle: cycle + 1 },
      computed: { trainingMaxKg: tm },
      confidence: state.tm != null ? "high" : "medium",
      verdict: `week ${week + 1} of the wave`,
      summary: [
        state.tm == null && est ? `Training max ${kg(tm)}: 90% of your ${kg(Math.round(est.kg))} strength estimate.` : `Training max ${kg(tm)}.`,
        `Week ${week + 1} of 4 (${plan.label}): ${pcts} of the training max.`,
        ...(plan.plus ? ["The last set is as many as you can; reaching its reps keeps the wave going."] : ["A light week to recover before the next cycle."]),
        ...lines,
      ],
    },
  };
}

/** A recipe as a ProgressionAlgorithm, under the id `recipe:<id>`. */
export function recipeAlgorithm(recipe: ProgressionRecipe): ProgressionAlgorithm {
  return {
    id: recipeAlgorithmId(recipe.id),
    name: recipe.name,
    description: describeRecipe(recipe),
    author: "you",
    defaultState: {},
    async suggest(input) {
      const state = (input.state ?? {}) as RecipeState;
      const { count, line } = setCountFor(recipe, input);
      let out: ProgressionOutput =
        recipe.weightFrom === "wave"
          ? planWave(recipe, input, count, state)
          : recipe.weightFrom === "last"
            ? await planFromLast(recipe, input, count, state)
            : await planFromEstimate(recipe, input, count);
      if (recipe.weightFrom === "estimate") out = { ...out, nextState: state };
      out = withLines(out, [line]);

      // In a calorie deficit: don't go heavier than last time (the wave holds its max above).
      if (recipe.food === "diary" && recipe.weightFrom !== "wave" && inDeficit(input.food) && out.sets.length > 0) {
        const lastTop = topWeight(input.history[0]);
        if (lastTop != null && out.sets.some((s) => s.weight > lastTop + 0.01)) {
          const f = input.food!;
          out = withLines(
            { ...out, sets: out.sets.map((s) => ({ ...s, weight: Math.min(s.weight, lastTop) })), change: { kind: "reps", text: "Holding", detail: "You're eating under maintenance, so the weight holds." } },
            [`You've averaged ${Math.round(f.avgKcal).toLocaleString("en-GB")} kcal a day over ${f.daysLogged} logged days, about ${Math.round(f.maintenanceKcal - f.avgKcal)} under maintenance, so the weight holds at ${kg(lastTop)} instead of going up.`],
          );
        }
      }
      return out;
    },
  };
}
