// A program ending: how the block went, and the next one (canvas W3). The review is worked out
// from the client's own sessions of this program; the rerun is their copy again, from a new
// start, with the rules planning from today's numbers.

import { getProgramStartMs, renameExercise, touchCoachProgram, type CoachProgram, type ProgramStrength } from "./CoachProgram";
import { editTemplate, forBuilder, setLength, setLighterWeeks } from "./programBuilder";
import { createId } from "./ids";
import { estimated1RM } from "./oneRepMax";
import { DEFAULT_SET_TARGETS } from "./weeklySets";
import { getExercises, type LastingSwap, type WorkoutSession } from "./workout";
import type { MuscleGroup } from "./exercise";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** A lift at one point: its estimate in kg, or reps when it's bodyweight. */
export type LiftPoint = { kg: number } | { reps: number };

export type BlockReview = {
  sessionsDone: number;
  /** The days planned in the weeks gone so far. */
  sessionsPlanned: number;
  /** The program's exercises they did, best in the first two weeks and the last two. */
  lifts: { name: string; start: LiftPoint | null; now: LiftPoint | null }[];
  /** Muscles the program trains whose working sets a week were under the usual lowest
   * (after two weeks or more). */
  behind: { muscle: MuscleGroup; sets: number; target: number }[];
};

function best(name: string, sessions: WorkoutSession[]): LiftPoint | null {
  let kg = 0, reps = 0;
  const key = name.trim().toLowerCase();
  for (const s of sessions) {
    for (const e of getExercises(s)) {
      if (e.exerciseName.trim().toLowerCase() !== key) continue;
      for (const set of e.sets) {
        if (!set.completed || set.setType === "warmup" || set.reps <= 0) continue;
        if (set.weight > 0) kg = Math.max(kg, estimated1RM(set.weight, set.reps));
        else reps = Math.max(reps, set.reps);
      }
    }
  }
  return kg > 0 ? { kg: Math.round(kg * 2) / 2 } : reps > 0 ? { reps } : null;
}

export function reviewBlock(
  program: CoachProgram,
  sessions: WorkoutSession[],
  musclesOf: (exerciseName: string) => MuscleGroup[],
  now = Date.now(),
): BlockReview {
  const start = getProgramStartMs(program) ?? now;
  const mine = sessions.filter((s) => s.endedAtMs != null && s.source?.kind === "program" && s.source.parentId === program.id && s.startedAtMs >= start);
  const weeks = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const weeksGone = Math.max(1, Math.min(weeks.length, Math.ceil((now - start) / WEEK)));
  const sessionsPlanned = weeks.slice(0, weeksGone).reduce((n, w) => n + w.days.length, 0);

  const names: string[] = [];
  for (const d of weeks[0]?.days ?? []) for (const b of d.blocks) if (b.type === "strength" && !names.includes(b.exerciseName)) names.push(b.exerciseName);
  const first = mine.filter((s) => s.startedAtMs < start + 2 * WEEK);
  const last = mine.filter((s) => s.startedAtMs >= now - 2 * WEEK);
  const lifts = names.map((name) => ({ name, start: best(name, first), now: best(name, last) })).filter((l) => l.start || l.now);

  const trained = new Set(names.flatMap((n) => musclesOf(n)));
  const sets = new Map<MuscleGroup, number>();
  for (const s of mine) {
    for (const e of getExercises(s)) {
      const done = e.sets.filter((x) => x.completed && x.setType !== "warmup").length;
      for (const m of musclesOf(e.exerciseName).slice(0, 1)) sets.set(m, (sets.get(m) ?? 0) + done);
    }
  }
  // Under two weeks is too soon to say a muscle is behind.
  const behind = weeksGone < 2 ? [] : [...trained]
    .map((muscle) => ({ muscle, sets: Math.round((sets.get(muscle) ?? 0) / weeksGone), target: DEFAULT_SET_TARGETS[muscle].lo }))
    .filter((m) => m.target > 0 && m.sets < m.target)
    .sort((a, b) => b.target - b.sets - (a.target - a.sets))
    .slice(0, 3);
  return { sessionsDone: mine.length, sessionsPlanned, lifts, behind };
}

export type NextBlockOptions = {
  startDateMs: number;
  lengthWeeks: number;
  /** One more set on each exercise for these muscles. */
  moreSetsFor: MuscleGroup[];
  lighterFirst: boolean;
  /** Their swaps for the rest of the program, carried into the new block. */
  keepSwaps: LastingSwap[];
};

/** The block again from a new start: their copy, numbers no longer pinned so the rules plan
 * from today's estimates, with the small changes picked. */
export function nextBlockFrom(current: CoachProgram, opts: NextBlockOptions, musclesOf: (exerciseName: string) => MuscleGroup[]): CoachProgram {
  const now = Date.now();
  const { clientStartedAtMs: _c, ...rest } = current;
  let p: CoachProgram = {
    ...rest,
    id: createId("cprog"),
    archived: false,
    startMode: "fixed-date",
    startDateMs: opts.startDateMs,
    createdAtMs: now,
    updatedAtMs: now,
  };
  const unpin = (q: CoachProgram): CoachProgram => ({ ...q, weeks: q.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" ? { ...b, sets: b.sets.map(({ pinned: _p, ...s }) => s) } : b)) })) })) });
  const more = new Set(opts.moreSetsFor);
  const addSet = (b: ProgramStrength): ProgramStrength => {
    if (!musclesOf(b.exerciseName).slice(0, 1).some((m) => more.has(m))) return b;
    const last = [...b.sets].reverse().find((s) => s.setType !== "warmup") ?? b.sets.at(-1);
    return last ? { ...b, sets: [...b.sets, { ...last, id: createId("pset"), orderIndex: b.sets.length }] } : b;
  };
  // Shaped first (a later week's own numbers read as pinned), then unpinned.
  const shaped = forBuilder(p) ? unpin(forBuilder(p)!) : null;
  if (shaped) {
    // Rebuilt from the built week: later weeks lose their old numbers and follow the rules.
    p = editTemplate(shaped, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" ? addSet(b) : b)) })) }));
    p = setLength(p, opts.lengthWeeks);
    const lighter = p.weeks.filter((w) => w.lighter).map((w) => w.weekNumber);
    p = setLighterWeeks(p, opts.lighterFirst ? [...new Set([1, ...lighter])] : lighter);
  } else {
    p = unpin(p);
    p = { ...p, weeks: p.weeks.map((w) => ({ ...w, ...(opts.lighterFirst && w.weekNumber === 1 ? { lighter: true } : {}), days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" ? addSet(b) : b)) })) })) };
  }
  for (const s of opts.keepSwaps) p = renameExercise(p, s.from, { exerciseName: s.to, ...(s.toId ? { exerciseId: s.toId } : {}) });
  return touchCoachProgram({ ...p, lengthWeeks: p.weeks.length });
}

/** The block's numbers as a message (until the block summary card, canvas W7). */
export function blockSummaryText(programName: string, r: BlockReview, nextStartMs?: number): string {
  const point = (x: LiftPoint | null) => (!x ? "–" : "kg" in x ? `${x.kg} kg` : `${x.reps} reps`);
  const lines = [
    `${programName}: how your block went`,
    `Sessions: ${r.sessionsDone} of ${r.sessionsPlanned}`,
    ...r.lifts.slice(0, 5).map((l) => `${l.name}: ${point(l.start)} → ${point(l.now)}`),
  ];
  const next = nextStartMs != null ? `\n\nYour next block starts ${new Date(nextStartMs).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}.` : "";
  return `${lines.join("\n")}${next}`;
}
