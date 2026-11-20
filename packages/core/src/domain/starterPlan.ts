// The plan onboarding builds from four answers (design canvas O1, E0, O2, O3): what the
// person wants from training, how long they've lifted, how many days a week, and (chips on
// the plan screen) what equipment they have and how long a workout can be. The result is an
// ordinary split on a weekday schedule plus a rep range per exercise, so everything after
// onboarding (progression, the split editor, the weekly target) works on it as on any other.
import { CORE_EXERCISES } from "./coreExercises";
import { addDay, addPlannedStrength, createSplit, type WorkoutSplit } from "./WorkoutSplit";

export type TrainingGoal = "strength" | "muscle" | "both" | "fit" | "leaner";
export type TrainingExperience = "new" | "under2" | "2plus" | "compete";
export type DaysPerWeek = 2 | 3 | 4 | 5;
export type PlanEquipment = "gym" | "home" | "dumbbells";
export type PlanLength = 30 | 45 | 60;
export type PlanKind = "fullbody2" | "fullbody3" | "ppl3" | "upperlower4" | "ulppl5";

export type StarterAnswers = {
  goal: TrainingGoal;
  experience: TrainingExperience;
  days: DaysPerWeek;
  equipment: PlanEquipment;
  minutes: PlanLength;
};

export type StarterExercise = { name: string; id?: string; sets: number; repRange: [number, number] };
export type StarterDay = { name: string; short: string; weekday: number; exercises: StarterExercise[]; minutes: number };
export type StarterPlan = { kind: PlanKind; name: string; daysPerWeek: number; days: StarterDay[] };

export const GOAL_LABELS: Record<TrainingGoal, { title: string; blurb: string; echo: string }> = {
  strength: { title: "Get stronger", blurb: "Lift heavier every few weeks", echo: "Stronger" },
  muscle: { title: "Build muscle", blurb: "Look and feel bigger", echo: "Bigger" },
  both: { title: "Both", blurb: "Stronger and bigger, a bit of both", echo: "Stronger and bigger" },
  fit: { title: "Stay fit", blurb: "Keep moving, keep what you've built", echo: "Fit" },
  leaner: { title: "Lose fat, keep my strength", blurb: "Leaner without going backwards", echo: "Leaner and strong" },
};

export const EQUIPMENT_LABELS: Record<PlanEquipment, string> = { gym: "Full gym", home: "Home gym", dumbbells: "Dumbbells only" };
export const LENGTH_LABELS: Record<PlanLength, string> = { 30: "About 30 min", 45: "About 45 min", 60: "60 min or more" };

// ── Exercises ────────────────────────────────────────────────────────────────────────────
// A slot is a movement; which exercise fills it depends on the equipment. "main" slots are
// the big lifts that get the goal's rep range; the rest get the accessory range.

type Slot =
  | "squat" | "hinge" | "deadlift" | "press" | "incline" | "overhead" | "row" | "pulldown"
  | "legs" | "hamstrings" | "lateral" | "reardelt" | "biceps" | "triceps" | "calves" | "core";

const SLOT_EXERCISES: Record<Slot, Record<PlanEquipment, string | null>> = {
  squat: { gym: "Squat", home: "Squat", dumbbells: "Goblet Squat" },
  hinge: { gym: "Romanian Deadlift", home: "Romanian Deadlift", dumbbells: "Dumbbell Romanian Deadlift" },
  deadlift: { gym: "Deadlift", home: "Deadlift", dumbbells: "Dumbbell Romanian Deadlift" },
  press: { gym: "Bench Press", home: "Bench Press", dumbbells: "Dumbbell Bench Press" },
  incline: { gym: "Incline Dumbbell Press", home: "Incline Dumbbell Press", dumbbells: "Incline Dumbbell Press" },
  overhead: { gym: "Overhead Press", home: "Overhead Press", dumbbells: "Seated Dumbbell Shoulder Press" },
  row: { gym: "Barbell Row", home: "Barbell Row", dumbbells: "Dumbbell Row" },
  pulldown: { gym: "Lat Pulldown", home: "Pull-Up", dumbbells: "Chest-Supported Row" },
  legs: { gym: "Leg Press", home: "Bulgarian Split Squat", dumbbells: "Bulgarian Split Squat" },
  hamstrings: { gym: "Leg Curl", home: "Single-Leg Romanian Deadlift", dumbbells: "Single-Leg Romanian Deadlift" },
  lateral: { gym: "Lateral Raise", home: "Lateral Raise", dumbbells: "Lateral Raise" },
  reardelt: { gym: "Face Pull", home: "Rear Delt Fly", dumbbells: "Rear Delt Fly" },
  biceps: { gym: "Bicep Curl", home: "Bicep Curl", dumbbells: "Bicep Curl" },
  triceps: { gym: "Tricep Pushdown", home: "Overhead Dumbbell Tricep Extension", dumbbells: "Overhead Dumbbell Tricep Extension" },
  calves: { gym: "Calf Raise", home: null, dumbbells: null },
  core: { gym: "Plank", home: "Plank", dumbbells: "Plank" },
};

const MAIN_SLOTS = new Set<Slot>(["squat", "hinge", "deadlift", "press", "overhead", "row"]);
const ISOLATION_SLOTS = new Set<Slot>(["lateral", "reardelt", "biceps", "triceps", "calves", "core"]);

// ── Plans ────────────────────────────────────────────────────────────────────────────────
// Each day lists its slots in order of importance: a shorter workout drops from the end.

type DayTemplate = { name: string; short: string; weekday: number; slots: Slot[] };
type PlanTemplate = { kind: PlanKind; name: string; days: DayTemplate[] };

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;
const FB_A: Slot[] = ["squat", "press", "row", "lateral", "biceps", "core"];
const FB_B: Slot[] = ["deadlift", "overhead", "pulldown", "legs", "triceps", "calves"];
const FB_C: Slot[] = ["squat", "incline", "pulldown", "hamstrings", "reardelt", "biceps"];
const UPPER_A: Slot[] = ["press", "row", "incline", "pulldown", "biceps", "triceps"];
const LOWER_A: Slot[] = ["squat", "hinge", "legs", "hamstrings", "calves", "core"];
const UPPER_B: Slot[] = ["overhead", "pulldown", "press", "row", "lateral", "triceps"];
const LOWER_B: Slot[] = ["deadlift", "legs", "hamstrings", "squat", "calves", "core"];
const PUSH: Slot[] = ["press", "overhead", "incline", "lateral", "triceps", "core"];
const PULL: Slot[] = ["pulldown", "row", "reardelt", "biceps", "hinge", "core"];
const LEGS: Slot[] = ["squat", "hinge", "legs", "hamstrings", "calves", "core"];

const PLANS: Record<PlanKind, PlanTemplate> = {
  fullbody2: { kind: "fullbody2", name: "Full Body", days: [
    { name: "Full Body A", short: "A", weekday: MON, slots: FB_A },
    { name: "Full Body B", short: "B", weekday: THU, slots: FB_B },
  ] },
  fullbody3: { kind: "fullbody3", name: "Full Body", days: [
    { name: "Full Body A", short: "A", weekday: MON, slots: FB_A },
    { name: "Full Body B", short: "B", weekday: WED, slots: FB_B },
    { name: "Full Body C", short: "C", weekday: FRI, slots: FB_C },
  ] },
  ppl3: { kind: "ppl3", name: "Push / Pull / Legs", days: [
    { name: "Push", short: "Pu", weekday: MON, slots: PUSH },
    { name: "Pull", short: "Pl", weekday: WED, slots: PULL },
    { name: "Legs", short: "Lg", weekday: FRI, slots: LEGS },
  ] },
  upperlower4: { kind: "upperlower4", name: "Upper / Lower", days: [
    { name: "Upper A", short: "Up A", weekday: MON, slots: UPPER_A },
    { name: "Lower A", short: "Lo A", weekday: TUE, slots: LOWER_A },
    { name: "Upper B", short: "Up B", weekday: THU, slots: UPPER_B },
    { name: "Lower B", short: "Lo B", weekday: FRI, slots: LOWER_B },
  ] },
  ulppl5: { kind: "ulppl5", name: "Upper / Lower + Push / Pull / Legs", days: [
    { name: "Upper", short: "Up", weekday: MON, slots: UPPER_A },
    { name: "Lower", short: "Lo", weekday: TUE, slots: LOWER_A },
    { name: "Push", short: "Pu", weekday: THU, slots: PUSH },
    { name: "Pull", short: "Pl", weekday: FRI, slots: PULL },
    { name: "Legs", short: "Lg", weekday: SAT, slots: LEGS },
  ] },
};

const PLAN_DAYS: Record<PlanKind, number> = { fullbody2: 2, fullbody3: 3, ppl3: 3, upperlower4: 4, ulppl5: 5 };

/** The plan that fits the number of days best. */
export function planKindFor(days: DaysPerWeek): PlanKind {
  return days === 2 ? "fullbody2" : days === 3 ? "fullbody3" : days === 4 ? "upperlower4" : "ulppl5";
}

/** The other plans, closest in days first ("Other plans" on the plan screen). */
export function otherPlanKinds(current: PlanKind): { kind: PlanKind; name: string; daysPerWeek: number }[] {
  const days = PLAN_DAYS[current];
  return (Object.keys(PLANS) as PlanKind[])
    .filter((k) => k !== current)
    .sort((a, b) => Math.abs(PLAN_DAYS[a] - days) - Math.abs(PLAN_DAYS[b] - days) || PLAN_DAYS[a] - PLAN_DAYS[b])
    .map((k) => ({ kind: k, name: PLANS[k].name, daysPerWeek: PLAN_DAYS[k] }));
}

/** The rep range a goal gives the big lifts and the rest (design canvas O1). */
export function repRangesFor(goal: TrainingGoal): { main: [number, number]; other: [number, number] } {
  switch (goal) {
    case "strength": return { main: [3, 6], other: [6, 10] };
    case "both": return { main: [5, 8], other: [8, 12] };
    case "leaner": return { main: [5, 8], other: [8, 12] };
    case "muscle": return { main: [8, 12], other: [10, 15] };
    case "fit": return { main: [8, 12], other: [10, 15] };
  }
}

/** Exercises per workout for a length; someone just starting gets at most five. */
function exercisesFor(minutes: PlanLength, experience: TrainingExperience): number {
  const n = minutes === 30 ? 4 : minutes === 45 ? 5 : 6;
  return experience === "new" ? Math.min(n, 5) : n;
}

/** A rough workout length: about 2.5 minutes a set with rest, plus warming up. */
export function estimateMinutes(exercises: { sets: number }[]): number {
  const sets = exercises.reduce((n, e) => n + e.sets, 0);
  return Math.round((sets * 2.5 + 8) / 5) * 5;
}

const BY_NAME = new Map(CORE_EXERCISES.map((e) => [e.name, e]));

export function buildStarterPlan(answers: StarterAnswers, kind: PlanKind = planKindFor(answers.days)): StarterPlan {
  const template = PLANS[kind];
  const ranges = repRangesFor(answers.goal);
  const perDay = exercisesFor(answers.minutes, answers.experience);
  const days = template.days.map((day): StarterDay => {
    const exercises: StarterExercise[] = [];
    const used = new Set<string>();
    for (const slot of day.slots) {
      if (exercises.length >= perDay) break;
      const name = SLOT_EXERCISES[slot][answers.equipment];
      if (!name || used.has(name)) continue;
      used.add(name);
      const main = MAIN_SLOTS.has(slot);
      exercises.push({
        name,
        id: BY_NAME.get(name)?.id,
        sets: ISOLATION_SLOTS.has(slot) ? 2 : 3,
        repRange: main ? ranges.main : ranges.other,
      });
    }
    return { name: day.name, short: day.short, weekday: day.weekday, exercises, minutes: estimateMinutes(exercises) };
  });
  return { kind, name: template.name, daysPerWeek: PLAN_DAYS[kind], days };
}

/** The plan as a split on a weekday schedule, ready to save and make active. */
export function starterPlanToSplit(plan: StarterPlan): WorkoutSplit {
  let split: WorkoutSplit = { ...createSplit(plan.name), schedule: "weekdays" };
  for (const day of plan.days) {
    split = addDay(split, day.name);
    const dayId = split.days[split.days.length - 1]!.id;
    split = { ...split, days: split.days.map((d) => (d.id === dayId ? { ...d, weekday: day.weekday } : d)) };
    for (const ex of day.exercises) {
      split = addPlannedStrength(split, dayId, { exerciseName: ex.name, exerciseId: ex.id, targets: { sets: ex.sets } });
    }
  }
  return split;
}

/** Every exercise in the plan with its rep range, once (for the exercises' own settings). */
export function starterRepRanges(plan: StarterPlan): { name: string; id?: string; repRange: [number, number] }[] {
  const seen = new Map<string, { name: string; id?: string; repRange: [number, number] }>();
  for (const day of plan.days) {
    for (const ex of day.exercises) if (!seen.has(ex.name)) seen.set(ex.name, { name: ex.name, id: ex.id, repRange: ex.repRange });
  }
  return [...seen.values()];
}
