/**
 * Strength milestones lifters already care about: plate numbers on the big three and lifts
 * relative to bodyweight. Exercises are matched by name, conservatively (a dumbbell or
 * incline bench isn't a bench press milestone), so a miss means no badge, never a false one.
 */

export type Milestone = { id: string; label: string };

export type BigLift = "bench" | "squat" | "deadlift";

const PATTERNS: Record<BigLift, { match: RegExp; exclude: RegExp }> = {
  bench: { match: /\bbench(\s+press)?\b/i, exclude: /incline|decline|dumbbell|\bdb\b|close|smith|machine|floor|pin|board|spoto|larsen|paused?\s+db/i },
  squat: { match: /\bsquats?\b/i, exclude: /front|goblet|split|hack|bulgarian|smith|box|jump|pistol|sissy|overhead|zercher|belt|machine|leg press|safety bar|ssb|pause|cossack/i },
  deadlift: { match: /\bdeadlifts?\b/i, exclude: /romanian|\brdl\b|stiff|single|deficit|snatch|trap|hex|block|rack|dumbbell|\bdb\b|kettlebell|smith/i },
};

export function bigLiftOf(exerciseName: string): BigLift | null {
  for (const lift of ["bench", "squat", "deadlift"] as const) {
    const p = PATTERNS[lift];
    if (p.match.test(exerciseName) && !p.exclude.test(exerciseName)) return lift;
  }
  return null;
}

const PLATES: { lift: BigLift; kg: number; label: string }[] = [
  { lift: "bench", kg: 60, label: "One-plate bench" },
  { lift: "bench", kg: 100, label: "Two-plate bench" },
  { lift: "bench", kg: 140, label: "Three-plate bench" },
  { lift: "squat", kg: 100, label: "Two-plate squat" },
  { lift: "squat", kg: 140, label: "Three-plate squat" },
  { lift: "squat", kg: 180, label: "Four-plate squat" },
  { lift: "deadlift", kg: 140, label: "Three-plate deadlift" },
  { lift: "deadlift", kg: 180, label: "Four-plate deadlift" },
  { lift: "deadlift", kg: 220, label: "Five-plate deadlift" },
];

const RATIOS: { lift: BigLift; x: number; label: string }[] = [
  { lift: "bench", x: 1, label: "Bodyweight bench" },
  { lift: "bench", x: 1.5, label: "1.5× bodyweight bench" },
  { lift: "squat", x: 1.5, label: "1.5× bodyweight squat" },
  { lift: "squat", x: 2, label: "2× bodyweight squat" },
  { lift: "deadlift", x: 2, label: "2× bodyweight deadlift" },
  { lift: "deadlift", x: 2.5, label: "2.5× bodyweight deadlift" },
];

/**
 * Milestones from the heaviest set per exercise (any reps, a real logged set). Bodyweight
 * ratios use the bodyweight around when the lift was done when known, else today's.
 */
export function liftMilestones(
  records: { exerciseName: string; weight: number; bodyweightKg?: number | null }[],
  bodyweightKg: number | null,
): Milestone[] {
  const best: Partial<Record<BigLift, number>> = {};
  const bestRatio: Partial<Record<BigLift, number>> = {};
  for (const r of records) {
    const lift = bigLiftOf(r.exerciseName);
    if (!lift || !(r.weight > 0)) continue;
    best[lift] = Math.max(best[lift] ?? 0, r.weight);
    const bw = r.bodyweightKg ?? bodyweightKg;
    if (bw && bw > 0) bestRatio[lift] = Math.max(bestRatio[lift] ?? 0, r.weight / bw);
  }
  const out: Milestone[] = [];
  for (const p of PLATES) {
    if ((best[p.lift] ?? 0) >= p.kg) out.push({ id: `plates-${p.lift}-${p.kg}`, label: p.label });
  }
  for (const r of RATIOS) {
    // A hair of tolerance so 89.9 kg at 90 kg bodyweight on a rounded log still counts.
    if ((bestRatio[r.lift] ?? 0) >= r.x - 0.001) out.push({ id: `bw-${r.lift}-${r.x}`, label: r.label });
  }
  return out;
}

export const WEEK_STREAK_TIERS = [4, 12, 26, 52] as const;
export const SESSION_COUNT_TIERS = [50, 100, 250, 500] as const;
export const GOALS_REACHED_TIERS = [1, 5, 10] as const;
