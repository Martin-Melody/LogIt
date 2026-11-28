// Estimates for lifts someone hasn't logged yet, from the ones they have (Phase 6.2, canvas SP1/SP2).
// "If they've deadlifted 200 × 5, their leg extension is safely more than 40 kg" (Martin). Each
// exercise has a movement and a factor against that movement's reference lift; movements have a
// rough level against the deadlift. The lifter's own lifts set their level in a movement (the
// median of what they've logged in it), and only when a movement has nothing logged does another
// movement's level stand in. Suggestions take the low end: starting too light costs one easy set,
// too heavy a failed one. Machines are the least sure (stacks differ by brand).

import { estimated1RM } from "./oneRepMax";
import { loggedExercises } from "./loggedSets";
import type { WorkoutSession } from "./workout";

export type Movement =
  | "squat" | "hinge" | "lunge" | "hip-thrust" | "horizontal-press" | "incline-press" | "vertical-press" | "dip"
  | "horizontal-pull" | "vertical-pull" | "knee-extension" | "knee-flexion" | "elbow-flexion" | "elbow-extension"
  | "lateral-raise" | "rear-delt" | "fly" | "calf" | "shrug";

type Rule = [RegExp, Movement, number];
// First match wins: specific names before general ones. The factor is against the movement's
// reference lift (barbell back squat, deadlift, bench press, overhead press, barbell row, lat
// pulldown…). Dumbbell lifts are per hand.
const RULES: Rule[] = [
  // Arms first: "Incline biceps curl" is a curl, not an incline press.
  [/incline.*curl/, "elbow-flexion", 0.8],
  [/(bicep|biceps|hammer|preacher|ez|concentration|spider|drag).*curl|^curl|dumbbell curl|barbell curl|cable curl/, "elbow-flexion", 1],
  [/overhead.*(tricep|extension)|(tricep|triceps).*overhead/, "elbow-extension", 0.75],
  [/pushdown|push.?down|skull|tricep|triceps|french press|kickback/, "elbow-extension", 1],
  [/wide.*(pulldown|pull.?down)|(pulldown|pull.?down).*wide/, "vertical-pull", 0.85],
  [/pulldown|pull.?down/, "vertical-pull", 1],
  [/single.?leg leg extension|one.?leg leg extension/, "knee-extension", 0.5],
  [/leg extension/, "knee-extension", 1],
  [/leg curl|hamstring curl/, "knee-flexion", 1],
  [/calf/, "calf", 1],
  [/hip thrust|glute bridge/, "hip-thrust", 1],
  [/single.?leg.*(deadlift|rdl)|(deadlift|rdl).*single.?leg/, "hinge", 0.25],
  [/romanian|rdl|stiff.?leg/, "hinge", 0.7],
  [/good ?morning/, "hinge", 0.45],
  [/trap.?bar deadlift|hex.?bar/, "hinge", 1.05],
  [/deadlift/, "hinge", 1],
  [/front squat/, "squat", 0.8],
  [/goblet/, "squat", 0.3],
  [/hack squat/, "squat", 1.05],
  [/leg press/, "squat", 1.6],
  [/belt squat/, "squat", 0.9],
  [/split squat|bulgarian/, "lunge", 1],
  [/lunge|step.?up/, "lunge", 0.9],
  [/squat/, "squat", 1],
  [/incline.*dumbbell|dumbbell.*incline/, "incline-press", 0.33],
  [/incline/, "incline-press", 1],
  [/close.?grip/, "horizontal-press", 0.85],
  [/(dumbbell|db).*(bench|press)|(bench|chest press).*(dumbbell|db)/, "horizontal-press", 0.36],
  [/chest press|machine press/, "horizontal-press", 0.9],
  [/bench/, "horizontal-press", 1],
  [/push.?press/, "vertical-press", 1.2],
  [/(dumbbell|db|arnold).*(shoulder|overhead) press|seated dumbbell press|arnold/, "vertical-press", 0.38],
  [/shoulder press|overhead|military|ohp/, "vertical-press", 1],
  [/dip/, "dip", 1],
  [/(dumbbell|db|one.?arm|single.?arm).*row/, "horizontal-pull", 0.45],
  [/t.?bar row/, "horizontal-pull", 1.35],
  [/cable row|seated row|chest.?supported|machine row/, "horizontal-pull", 0.9],
  [/row/, "horizontal-pull", 1],
  [/lateral raise|side raise/, "lateral-raise", 1],
  [/rear delt|face pull|reverse fly/, "rear-delt", 1],
  [/fly|flye|pec deck/, "fly", 1],
  [/shrug/, "shrug", 1],
];

/** A movement's reference lift against the deadlift (1RMs of reasonably trained lifters). Rough on purpose. */
const LEVEL: Record<Movement, number> = {
  hinge: 1, squat: 0.85, lunge: 0.35, "hip-thrust": 0.9, "horizontal-press": 0.62, "incline-press": 0.52, "vertical-press": 0.4,
  dip: 0.45, "horizontal-pull": 0.55, "vertical-pull": 0.55, "knee-extension": 0.45, "knee-flexion": 0.32, "elbow-flexion": 0.24,
  "elbow-extension": 0.26, "lateral-raise": 0.07, "rear-delt": 0.15, fly: 0.2, calf: 0.8, shrug: 0.9,
};

const MACHINE = /machine|leg press|hack|extension|leg curl|pulldown|pec deck|cable|smith|selectorized|lever/;

export type LiftKind = { movement: Movement; factor: number; machine: boolean };

/** The movement and factor for an exercise name, or null for ones it can't place (and bodyweight ones). */
export function liftKind(name: string): LiftKind | null {
  const n = name.toLowerCase();
  // Bodyweight lifts log added weight (a dip with 5 kg), so they don't compare.
  if (/pull.?up|chin.?up|push.?up|bodyweight|assisted|^dips?$|weighted dip|ring dip/.test(n)) return null;
  for (const [re, movement, factor] of RULES) if (re.test(n)) return { movement, factor, machine: MACHINE.test(n) };
  return null;
}

/** What someone has logged, per lift: their best estimated max in the window and the set it came from. */
export type KnownLift = { name: string; e1rm: number; weight: number; reps: number; atMs: number; /** In how many workouts. */ sessions?: number };

/** Best estimated max of each lift in the last `days` (working sets, 1–12 reps), from logged sessions. */
export function knownLifts(sessions: WorkoutSession[], now: number, days = 180): KnownLift[] {
  const by = new Map<string, KnownLift>();
  const times = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.excludeFromProgression || (s.startedAtMs ?? 0) < now - days * 86_400_000) continue;
    for (const ex of loggedExercises(s)) {
      const k = ex.exerciseName.trim().toLowerCase();
      if (ex.sets.some((x) => x.setType !== "warmup" && x.weight > 0 && x.reps > 0)) times.set(k, (times.get(k) ?? new Set()).add(s.id));
      for (const set of ex.sets) {
        if (set.setType === "warmup" || set.weight <= 0 || set.reps < 1 || set.reps > 12) continue;
        const e1rm = estimated1RM(set.weight, set.reps);
        const key = ex.exerciseName.trim().toLowerCase();
        const cur = by.get(key);
        if (!cur || e1rm > cur.e1rm) by.set(key, { name: ex.exerciseName.trim(), e1rm, weight: set.weight, reps: set.reps, atMs: s.startedAtMs });
      }
    }
  }
  return [...by.values()].map((k) => ({ ...k, sessions: times.get(k.name.toLowerCase())?.size ?? 1 }));
}

/** Known lifts worth working others out from: done in two or more workouts, so not someone's
 * very first, careful sets (a beginner's empty-bar squat says little about their deadlift). */
export const solidLifts = (known: KnownLift[]) => known.filter((k) => (k.sessions ?? 1) >= 2);

/** The smallest estimated max a related start is planned from: below it, 2.5 kg steps and
 * rounding make nonsense ("7.5 kg × 19"), so the first set finds the weight instead. */
export const MIN_RELATED_E1RM_KG = 30;

export type RelatedEstimate = {
  /** A cautious estimated max for the target, kg. */
  e1rmKg: number;
  /** "rough" from the same movement, "guess" from another movement or on a machine. */
  confidence: "rough" | "guess";
  /** The lift it came from, for "From your deadlift 200 × 5". */
  basis: { name: string; weight: number; reps: number };
};

/** The big free-weight lifts: the only ones that speak for a different movement. */
const ANCHORS: Movement[] = ["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull"];

/** Which part of the body a movement works: a big lift only speaks for its own part. */
const REGION: Record<Movement, "lower" | "push" | "pull"> = {
  squat: "lower", hinge: "lower", lunge: "lower", "hip-thrust": "lower", "knee-extension": "lower", "knee-flexion": "lower", calf: "lower",
  "horizontal-press": "push", "incline-press": "push", "vertical-press": "push", dip: "push", fly: "push", "elbow-extension": "push", "lateral-raise": "push",
  "horizontal-pull": "pull", "vertical-pull": "pull", "elbow-flexion": "pull", "rear-delt": "pull", shrug: "pull",
};

/** A cautious estimate for a lift not logged yet, from the ones that are; null when there's nothing to go on. */
export function relatedEstimate(target: string, known: KnownLift[]): RelatedEstimate | null {
  const t = liftKind(target);
  if (!t) return null;
  const placed = known
    .filter((k) => k.name.toLowerCase() !== target.trim().toLowerCase())
    .map((k) => ({ k, kind: liftKind(k.name) }))
    .filter((x): x is { k: KnownLift; kind: LiftKind } => x.kind !== null);
  // Their level in the target's movement from that movement's own lifts, machine to machine or
  // free weight to free weight (machine stacks don't compare with free weights, or each other much).
  const same = placed.filter((x) => x.kind.movement === t.movement && x.kind.machine === t.machine);
  // Otherwise only a big free-weight lift speaks for another movement (for a machine, only as a
  // very cautious floor: "a 200 × 5 deadlift says leg extension is over 40 kg").
  const cross = placed.filter((x) => !x.kind.machine && ANCHORS.includes(x.kind.movement) && x.kind.factor >= 0.7 && REGION[x.kind.movement] === REGION[t.movement]);
  const pool = same.length ? same : cross;
  if (!pool.length) return null;
  const levels = pool.map((x) => (x.k.e1rm / x.kind.factor) * (same.length ? 1 : LEVEL[t.movement] / LEVEL[x.kind.movement]));
  // The lowest of them, then the low end again: starting light costs one easy set.
  const level = Math.min(...levels);
  // Across movements people differ most (an overhead press can be a third or two thirds of a bench).
  const caution = same.length ? 0.85 : t.machine ? 0.5 : 0.55;
  const basis = pool[levels.indexOf(level)]!.k;
  return {
    e1rmKg: Math.round(level * t.factor * caution * 10) / 10,
    confidence: same.length ? "rough" : "guess",
    basis: { name: basis.name, weight: basis.weight, reps: basis.reps },
  };
}
