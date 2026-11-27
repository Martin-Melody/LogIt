// What a program's rule plans for each exercise, week by week (canvas PG3 "Every week").
// On a client's copy the numbers come from their own strength estimates and what they've done;
// on one of your programs there are no numbers until it's someone's, so the rule is said in
// words ("6–8 reps, from their estimate") unless you preview it with a client's lifts.
//
// The built-in rules:
// - Fixed: the numbers as typed.
// - Linear: fill the rep range one rep a week, then add the step and start at the bottom again
//   (a fixed rep count adds the step every week).
// - LogIt Adaptive: weight from their strength estimate for the target reps, leaving
//   `repsInReserve` (2) in the tank; the estimate is planned to grow 1.25% a week.
// - 4-week wave: 5s, 3s, 5/3/1, then a light week, as percentages of a training max (90% of
//   their estimate); the cell shows the top set.
// Lighter weeks: about half the sets at the bottom of the range, same weight as the week before.
// A number the coach typed over the rule (pinned) stays put. A week they've done shows what
// they did.

import { loadFromPercent } from "./oneRepMax";
import { ruleFor, type CoachProgram, type ProgramRule, type ProgramSet, type ProgramStrength, type ProgramWeek } from "./CoachProgram";

export type PlanCell = {
  /** done: what they did; pinned: typed by the coach; rule: planned by the rule; words: no numbers yet. */
  source: "done" | "pinned" | "rule" | "words";
  weight?: number;
  /** "8", "6–8", "5/3/1" or "AMRAP". */
  reps?: string;
  sets: number;
  /** The rule in words when there are no numbers. */
  words?: string;
};

export type PlanContext = {
  /** Their strength estimate for an exercise (kg), when known. */
  e1rm?: (exerciseName: string) => number | null;
  /** What they did in a week, when they've done it. */
  done?: (weekNumber: number, block: ProgramStrength) => { weight: number; reps: number } | null;
};

const STEP = 2.5;
const round = (kg: number) => Math.round(Math.round(kg / STEP) * STEP * 1000) / 1000;
const working = (b: ProgramStrength) => [...b.sets].filter((s) => s.setType !== "warmup").sort((a, c) => a.orderIndex - c.orderIndex);
const range = (s: ProgramSet): [number, number] | null =>
  s.setType === "amrap" ? null : s.reps != null ? [s.reps, s.reps] : s.repsMin != null ? [s.repsMin, s.repsMax ?? s.repsMin] : null;
const repsText = (s: ProgramSet) => {
  if (s.setType === "amrap") return "AMRAP";
  const r = range(s);
  return !r ? undefined : r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`;
};

/** Adaptive: the load for `reps` with `rir` left, from an estimate (Epley, inverted). */
export function loadFor(e1rm: number, reps: number, rir = 2): number {
  return round(e1rm / (1 + (reps + rir) / 30));
}

const WAVE = [
  { reps: "5", pct: 85 },
  { reps: "3", pct: 90 },
  { reps: "5/3/1", pct: 95 },
  { reps: "5", pct: 60 },
] as const;

/** Every planned cell of one exercise, weeks in order. */
export function planExercise(program: CoachProgram, blockId: string, ctx: PlanContext = {}): (PlanCell | null)[] {
  const weeks = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const out: (PlanCell | null)[] = [];
  let k = -1; // index among the normal (not lighter) weeks
  let lastWeight: number | undefined;
  for (const w of weeks) {
    const block = findBlock(w, blockId);
    if (!block) { out.push(null); continue; }
    const cell = planWeek(program, w, block, ctx, w.lighter ? k : ++k, lastWeight);
    if (cell.weight != null) lastWeight = cell.weight;
    out.push(cell);
  }
  return out;
}

function findBlock(w: ProgramWeek, id: string): ProgramStrength | null {
  for (const d of w.days) for (const b of d.blocks) if (b.id === id && b.type === "strength") return b;
  return null;
}

function planWeek(program: CoachProgram, week: ProgramWeek, block: ProgramStrength, ctx: PlanContext, k: number, lastWeight: number | undefined): PlanCell {
  const sets = working(block);
  const first = sets[0];
  const count = sets.length;
  const done = ctx.done?.(week.weekNumber, block);
  if (done) return { source: "done", weight: done.weight, reps: String(done.reps), sets: count };
  const pinned = sets.find((s) => s.pinned);
  if (pinned) return { source: "pinned", weight: pinned.weight, reps: repsText(pinned), sets: count };
  if (!first) return { source: "words", sets: 0, words: "No working sets" };

  const rule = ruleFor(program, block);
  // A rule built from blocks can set its own rep range; it wins over the exercise's.
  const r = (rule.kind === "own" && rule.recipe?.repRange) || range(first);
  if (week.lighter) {
    const lighterSets = Math.max(1, Math.round(count / 2));
    return lastWeight != null
      ? { source: "rule", weight: lastWeight, reps: String(r?.[0] ?? repsText(first) ?? ""), sets: lighterSets }
      : { source: "words", sets: lighterSets, words: `${lighterSets} ${lighterSets === 1 ? "set" : "sets"}, lighter week` };
  }
  return planByRule(rule, block, first, r, k, ctx, count);
}

function planByRule(rule: ProgramRule, block: ProgramStrength, first: ProgramSet, r: [number, number] | null, k: number, ctx: PlanContext, count: number): PlanCell {
  const est = ctx.e1rm?.(block.exerciseName) ?? null;
  const typed = first.weight ?? (first.percent1RM != null && est ? loadFromPercent(est, first.percent1RM) ?? undefined : undefined);
  const text = repsText(first);
  switch (rule.kind) {
    case "linear": {
      const step = rule.stepKg ?? STEP;
      const start = typed ?? (est && r ? loadFor(est, r[1]) : undefined);
      if (start == null) return { source: "words", sets: count, words: `${text ?? "Reps"}, +${step} kg ${r && r[0] !== r[1] ? `when they get ${r[1]}` : "each week"}` };
      if (r && r[0] !== r[1]) {
        const span = r[1] - r[0] + 1;
        return { source: "rule", weight: round(start + step * Math.floor(k / span)), reps: String(r[0] + (k % span)), sets: count };
      }
      return { source: "rule", weight: round(start + step * k), reps: text, sets: count };
    }
    case "adaptive": {
      if (!est || !r) return { source: "words", sets: count, words: `${text ?? "Reps"}, from their estimate` };
      const reps = r[1] - r[0] >= 1 ? r[1] - (k % 2) : r[1];
      return { source: "rule", weight: loadFor(est * (1 + 0.0125 * k), reps, rule.repsInReserve ?? 2), reps: String(reps), sets: count };
    }
    case "wave": {
      const wv = WAVE[k % 4]!;
      if (!est) return { source: "words", sets: count, words: `${wv.reps}s at up to ${wv.pct}% of their training max` };
      return { source: "rule", weight: round(est * 0.9 * (wv.pct / 100)), reps: wv.reps, sets: count };
    }
    case "own": {
      // A rule built from blocks plans like the built-in it's made from.
      const rc = rule.recipe;
      if (!rc) return { source: "words", sets: count, words: `Worked out on their phone (${rule.name})` };
      const rr = rc.repRange ?? r;
      const first2 = rr ? { ...first, reps: undefined, repsMin: rr[0], repsMax: rr[1] } : first;
      const asBuiltIn: ProgramRule = rc.weightFrom === "estimate" ? { kind: "adaptive", repsInReserve: rc.repsInReserve }
        : rc.weightFrom === "last" ? { kind: "linear", stepKg: rc.increment } : { kind: "wave" };
      return planByRule(asBuiltIn, block, first2, rr, k, ctx, rc.sets.mode === "fixed" ? rc.sets.count : count);
    }
    case "plugin":
      return { source: "words", sets: count, words: `Worked out on their phone (${rule.name})` };
    default:
      return typed != null || text ? { source: "rule", weight: typed, reps: text, sets: count } : { source: "words", sets: count, words: "Type the numbers" };
  }
}

/** "62.5 × 7", "BW × 8", "62.5 × 6 · 2 sets" (when the set count differs from usual). */
export function cellText(c: PlanCell, usualSets: number): string {
  if (c.source === "words") return c.words ?? "";
  const load = c.weight != null ? (c.weight > 0 ? String(c.weight) : "BW") : "";
  const main = load && c.reps ? `${load} × ${c.reps}` : load || (c.reps ? `${c.reps} reps` : "");
  return c.sets !== usualSets ? `${main} · ${c.sets} ${c.sets === 1 ? "set" : "sets"}` : main;
}

/** What the coach typed into a cell: "62.5 × 7", "62.5x7", "62.5 7", "7" (reps), "60kg". */
export function parseCell(text: string): { weight?: number; reps?: number; repsMin?: number; repsMax?: number } | null {
  const t = text.trim().toLowerCase().replace(",", ".").replace(/kg/g, "");
  if (!t) return null;
  const m = t.match(/^(bw|\d+(?:\.\d+)?)\s*(?:[x×*]|\s)\s*(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (m) {
    const weight = m[1] === "bw" ? 0 : Number(m[1]);
    const a = Number(m[2]), b = m[3] ? Number(m[3]) : undefined;
    return b != null ? { weight, repsMin: a, repsMax: b } : { weight, reps: a };
  }
  const reps = t.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (reps) return reps[2] ? { repsMin: Number(reps[1]), repsMax: Number(reps[2]) } : { reps: Number(reps[1]) };
  return null;
}

/** Type over a week's numbers for an exercise: every working set, pinned. */
export function pinWeek(program: CoachProgram, weekNumber: number, blockId: string, value: NonNullable<ReturnType<typeof parseCell>>): CoachProgram {
  return {
    ...program,
    weeks: program.weeks.map((w) => (w.weekNumber !== weekNumber ? w : {
      ...w,
      days: w.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => (b.id !== blockId || b.type !== "strength" ? b : {
          ...b,
          sets: b.sets.map((s) => {
            if (s.setType === "warmup") return s;
            const { reps: _r, repsMin: _a, repsMax: _b, percent1RM: _p, ...rest } = s;
            return { ...rest, ...value, pinned: true };
          }),
        })),
      })),
    })),
  };
}

/** "Clear": the week's numbers go back to the rule (the built week's). */
export function unpinWeek(program: CoachProgram, weekNumber: number, blockId: string): CoachProgram {
  const t = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0]!;
  const tb = findBlock(t, blockId);
  return {
    ...program,
    weeks: program.weeks.map((w) => (w.weekNumber !== weekNumber || w.id === t.id ? w : {
      ...w,
      days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === blockId && tb ? { ...tb, orderIndex: b.orderIndex } : b)) })),
    })),
  };
}


/** Their best estimate per exercise (lower-case name) over the last 12 weeks of sessions. */
export function estimatesFrom(sessions: { startedAtMs: number; blocks: { type: string; data: unknown }[] }[], nowMs = Date.now()): Map<string, number> {
  const since = nowMs - 84 * 86_400_000;
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.startedAtMs < since) continue;
    for (const b of s.blocks) {
      if (b.type !== "strength") continue;
      const d = b.data as { exerciseName: string; sets: { weight?: number; reps?: number; setType?: string; completed?: boolean }[] };
      for (const set of d.sets ?? []) {
        if (set.setType === "warmup" || set.completed === false || !(set.weight! > 0) || !(set.reps! > 0)) continue;
        const e = set.reps === 1 ? set.weight! : set.weight! * (1 + set.reps! / 30);
        const key = d.exerciseName.trim().toLowerCase();
        if (e > (m.get(key) ?? 0)) m.set(key, e);
      }
    }
  }
  return m;
}

/** What the rule plans this week for each exercise of a day, for starting it (the phone). */
export function planForWeek(program: CoachProgram, weekNumber: number, ctx: PlanContext): (blockId: string) => PlanCell | null {
  const index = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber).findIndex((w) => w.weekNumber === weekNumber);
  const cache = new Map<string, PlanCell | null>();
  return (blockId) => {
    if (index < 0) return null;
    if (!cache.has(blockId)) cache.set(blockId, planExercise(program, blockId, { e1rm: ctx.e1rm })[index] ?? null);
    return cache.get(blockId)!;
  };
}
