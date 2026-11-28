// A new client's starting point (Phase 6.11, canvas SP1): worked out from their training, nothing
// typed in. Their lifts with where each number comes from and how sure it is, how they train,
// weekly sets per muscle, what they keep coming back to, swap away from and skip.
import { isBodyweightLift, knownLifts, relatedEstimate } from "./relatedLifts";
import { comparePlan } from "./sessionHistory";
import { loggedExercises } from "./loggedSets";
import type { WorkoutSession } from "./workout";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export type StartingLift = {
  name: string;
  /** Their best recent set, when they've lifted it. */
  best: { weight: number; reps: number } | null;
  /** Estimated max, kg. A related one is cautious (the low end). Null for bodyweight lifts,
   * whose weight is what's added (a dip + 12.5). */
  e1rm: number | null;
  from: { kind: "logged"; times: number } | { kind: "related"; basis: string; machine: boolean };
  how: "high" | "rough" | "low";
};

export type StartingPoint = {
  workouts: number;
  sinceMs: number | null;
  lifts: StartingLift[];
  /** Over the last 8 weeks. */
  habits: { perWeek: number; weekdays: number[]; startHour: number | null; minutes: number | null; sets: number | null } | null;
  weeklySets: { muscle: string; sets: number }[];
  keeps: string[];
  swaps: { from: string; to: string; times: number }[];
  skips: { name: string; planned: number; done: number }[];
};

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null);
const key = (s: string) => s.trim().toLowerCase();

export function startingPoint(
  all: WorkoutSession[],
  now: number,
  opts: { muscleOf?: (name: string) => string[]; also?: string[] } = {},
): StartingPoint {
  const sessions = all.filter((s) => s.endedAtMs != null && !s.excludeFromProgression);
  const recent = sessions.filter((s) => s.startedAtMs >= now - 8 * WEEK);

  // Lifts: what they've logged most in the last 6 months, then the ones asked about (a program's
  // exercises) worked out from those.
  const known = knownLifts(sessions, now, 180);
  const times = new Map<string, number>();
  for (const s of sessions) for (const ex of loggedExercises(s)) if (ex.sets.some((x) => x.reps > 0)) times.set(key(ex.exerciseName), (times.get(key(ex.exerciseName)) ?? 0) + 1);
  const lifts: StartingLift[] = known
    .map((k) => ({ k, n: times.get(key(k.name)) ?? 1 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
    .map(({ k, n }) => ({ name: k.name, best: { weight: k.weight, reps: k.reps }, e1rm: isBodyweightLift(k.name) ? null : Math.round(k.e1rm), from: { kind: "logged" as const, times: n }, how: n >= 3 ? "high" as const : "rough" as const }));
  for (const name of opts.also ?? []) {
    if (lifts.some((l) => key(l.name) === key(name)) || known.some((k) => key(k.name) === key(name))) continue;
    const r = relatedEstimate(name, known);
    if (!r) continue;
    const machine = r.confidence === "guess" && /machine|extension|curl|press machine|pulldown|cable/i.test(name);
    lifts.push({ name, best: null, e1rm: Math.round(r.e1rmKg), from: { kind: "related", basis: `${r.basis.name} ${r.basis.weight} × ${r.basis.reps}`, machine }, how: r.confidence === "rough" ? "rough" : "low" });
  }

  // How they train, from the last 8 weeks.
  let habits: StartingPoint["habits"] = null;
  if (recent.length) {
    const byDay = new Array(7).fill(0) as number[];
    for (const s of recent) byDay[new Date(s.startedAtMs).getDay()]!++;
    const perWeek = Math.round((recent.length / 8) * 10) / 10;
    const weekdays = byDay.map((n, d) => ({ n, d })).filter((x) => x.n >= Math.max(2, recent.length / 8 / 2)).sort((a, b) => b.n - a.n).slice(0, Math.max(1, Math.round(perWeek))).map((x) => x.d).sort();
    const startHour = median(recent.map((s) => new Date(s.startedAtMs).getHours() + new Date(s.startedAtMs).getMinutes() / 60));
    const minutes = median(recent.filter((s) => s.endedAtMs! - s.startedAtMs < 4 * 3600_000).map((s) => Math.round((s.endedAtMs! - s.startedAtMs) / 60_000)));
    const sets = median(recent.map((s) => loggedExercises(s).reduce((n, ex) => n + ex.sets.filter((x) => x.setType !== "warmup" && x.reps > 0).length, 0)));
    habits = { perWeek, weekdays, startHour, minutes, sets };
  }

  // Weekly sets per muscle (primary muscles), last 8 weeks.
  const perMuscle = new Map<string, number>();
  if (opts.muscleOf) {
    for (const s of recent) for (const ex of loggedExercises(s)) {
      const n = ex.sets.filter((x) => x.setType !== "warmup" && x.reps > 0).length;
      for (const m of opts.muscleOf(ex.exerciseName).slice(0, 1)) perMuscle.set(m, (perMuscle.get(m) ?? 0) + n);
    }
  }
  const weeklySets = [...perMuscle].map(([muscle, n]) => ({ muscle, sets: Math.round(n / 8) })).filter((x) => x.sets > 0).sort((a, b) => b.sets - a.sets);

  // Keeps coming back to: in the most workouts, beyond the main lifts above.
  const top = new Set(lifts.map((l) => key(l.name)));
  const keeps = [...times].filter(([k]) => !top.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, n]) => n >= 3)
    .map(([k]) => sessions.flatMap(loggedExercises).find((e) => key(e.exerciseName) === k)!.exerciseName);

  // Swaps away from and skips, from workouts that had a plan.
  const swapMap = new Map<string, { from: string; to: string; times: number }>();
  const skipMap = new Map<string, { name: string; planned: number; done: number }>();
  for (const s of sessions) {
    for (const row of comparePlan(s)?.rows ?? []) {
      if (row.item.type !== "strength") continue;
      const sk = skipMap.get(key(row.item.name)) ?? { name: row.item.name, planned: 0, done: 0 };
      sk.planned++;
      if (row.status !== "skipped" && row.status !== "swapped") sk.done++;
      skipMap.set(key(row.item.name), sk);
      if (row.status === "swapped" && row.doneName) {
        const k2 = `${key(row.item.name)}→${key(row.doneName)}`;
        const sw = swapMap.get(k2) ?? { from: row.item.name, to: row.doneName, times: 0 };
        sw.times++;
        swapMap.set(k2, sw);
      }
    }
  }
  const swaps = [...swapMap.values()].filter((x) => x.times >= 2).sort((a, b) => b.times - a.times).slice(0, 3);
  const skips = [...skipMap.values()].filter((x) => x.planned >= 4 && x.done / x.planned <= 0.5).sort((a, b) => a.done / a.planned - b.done / b.planned).slice(0, 3);

  return {
    workouts: sessions.length,
    sinceMs: sessions.length ? Math.min(...sessions.map((s) => s.startedAtMs)) : null,
    lifts,
    habits,
    weeklySets,
    keeps,
    swaps,
    skips,
  };
}
