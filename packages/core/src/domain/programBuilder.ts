// The program builder (canvas PG2, Z6): the coach builds ONE week of days, and it applies to
// every week. A block keeps the same id in every week; a later week keeps its own numbers only
// where the coach typed them over the rule ("pinned", canvas PG3). Everything else follows the
// built week. Saved as you go, with undo, and changes from another device merged in.

import { createId } from "./ids";
import { touchCoachProgram, type CoachProgram, type ProgramBlock, type ProgramDay, type ProgramSet, type ProgramWeek } from "./CoachProgram";

const byOrder = <T extends { orderIndex: number }>(xs: T[]) => [...xs].sort((a, b) => a.orderIndex - b.orderIndex);
const byWeek = (ws: ProgramWeek[]) => [...ws].sort((a, b) => a.weekNumber - b.weekNumber);

/** The week the coach builds: week 1. */
export function templateOf(program: CoachProgram): ProgramWeek {
  return byWeek(program.weeks)[0]!;
}

const shape = (b: ProgramBlock) => (b.type === "strength" ? `s:${b.exerciseName.trim().toLowerCase()}:${b.sets.length}` : `${b.type}:${JSON.stringify({ ...b, id: "", orderIndex: 0 })}`);
const NUMBERS: (keyof ProgramSet)[] = ["reps", "repsMin", "repsMax", "weight", "percent1RM", "rpe", "restSec", "tempo", "setType"];
const sameNumbers = (a: ProgramSet, b: ProgramSet) => NUMBERS.every((k) => a[k] === b[k]);

/**
 * A program as the one-week builder edits it: every week shaped like week 1 (same days,
 * same exercises in the same order, same number of sets), with week 1's ids, and a later
 * week's different numbers kept as pinned. Null when the weeks differ in shape: those
 * programs stay in the week-by-week editor, so nothing is lost.
 */
export function forBuilder(program: CoachProgram): CoachProgram | null {
  const weeks = byWeek(program.weeks);
  const t = weeks[0];
  if (!t) return null;
  const tDays = byOrder(t.days);
  const out: ProgramWeek[] = [t];
  for (const w of weeks.slice(1)) {
    const days = byOrder(w.days);
    if (days.length !== tDays.length) return null;
    const rekeyed: ProgramDay[] = [];
    for (let i = 0; i < days.length; i++) {
      const td = tDays[i]!, d = days[i]!;
      const tb = byOrder(td.blocks), b = byOrder(d.blocks);
      if (tb.length !== b.length || tb.some((x, j) => shape(x) !== shape(b[j]!))) return null;
      rekeyed.push({
        ...td,
        blocks: tb.map((x, j) => {
          const y = b[j]!;
          if (x.type !== "strength" || y.type !== "strength") return x;
          const tSets = byOrder(x.sets), ySets = byOrder(y.sets);
          return { ...x, sets: tSets.map((s, k) => (sameNumbers(s, ySets[k]!) && !ySets[k]!.pinned ? s : { ...pick(ySets[k]!), id: s.id, orderIndex: s.orderIndex, pinned: true })) };
        }),
      });
    }
    out.push({ ...w, days: rekeyed });
  }
  return { ...program, weeks: out };
}

const pick = (s: ProgramSet): ProgramSet => ({ ...s });

/**
 * Every week from the built week: its days and blocks, with each later week's pinned set
 * numbers kept (matched by id). Week flags (lighter, name) stay per week.
 */
export function applyTemplate(program: CoachProgram, template: ProgramWeek): CoachProgram {
  const weeks = byWeek(program.weeks);
  return touchCoachProgram({
    ...program,
    weeks: weeks.map((w, i) => {
      if (i === 0) return { ...template, weekNumber: w.weekNumber, id: w.id, ...(w.lighter ? { lighter: true } : {}) };
      return { ...w, days: template.days.map((td) => mergeDay(td, w.days.find((d) => d.id === td.id))) };
    }),
  });
}

function mergeDay(td: ProgramDay, old: ProgramDay | undefined): ProgramDay {
  return {
    ...td,
    blocks: td.blocks.map((tb) => {
      const ob = old?.blocks.find((b) => b.id === tb.id);
      if (tb.type !== "strength" || ob?.type !== "strength") return tb;
      return { ...tb, sets: tb.sets.map((ts) => {
        const os = ob.sets.find((s) => s.id === ts.id);
        return os?.pinned ? { ...ts, ...Object.fromEntries(NUMBERS.filter((k) => k !== "setType").map((k) => [k, os[k]])), pinned: true } : ts;
      }) };
    }),
  };
}

/** Change the built week; every week follows. */
export function editTemplate(program: CoachProgram, fn: (week: ProgramWeek) => ProgramWeek): CoachProgram {
  return applyTemplate(program, fn(templateOf(program)));
}

/** How many weeks: more copies the built week (no pins), fewer drops the last ones. */
export function setLength(program: CoachProgram, weeks: number): CoachProgram {
  const n = Math.max(1, Math.min(52, Math.round(weeks)));
  const sorted = byWeek(program.weeks);
  const t = sorted[0]!;
  const next = sorted.slice(0, n);
  for (let k = next.length + 1; k <= n; k++) next.push({ id: createId("pweek"), weekNumber: k, days: t.days.map((d) => ({ ...d, blocks: d.blocks.map(unpin) })) });
  return touchCoachProgram({ ...program, lengthWeeks: n, weeks: next });
}

function unpin(b: ProgramBlock): ProgramBlock {
  return b.type === "strength" ? { ...b, sets: b.sets.map(({ pinned: _p, ...s }) => s) } : b;
}

/** Lighter weeks: fewer sets, same weight (canvas PG2). */
export function setLighterWeeks(program: CoachProgram, weekNumbers: number[]): CoachProgram {
  const set = new Set(weekNumbers);
  return touchCoachProgram({
    ...program,
    weeks: program.weeks.map(({ lighter: _l, ...w }) => (set.has(w.weekNumber) ? { ...w, lighter: true } : w)),
  });
}

// ── Two devices (canvas Z6) ─────────────────────────────────────────────────────

/** Both devices changed the same thing; the coach picks one. */
export type MergeConflict = {
  /** "block:<id>", "day:<id>" or "program:<field>". */
  key: string;
  /** What it is: "Hack Squat on Lower A", "Upper A", "the name". */
  label: string;
  mine: string;
  theirs: string;
};

export type MergeResult = {
  /** Mine with their changes to other things in it; conflicts keep mine until chosen. */
  program: CoachProgram;
  /** Their changes taken in, for "Added a change from your phone: …". */
  taken: string[];
  conflicts: MergeConflict[];
};

const PROGRAM_FIELDS = ["name", "description", "rule", "startMode", "startDateMs"] as const;
const DAY_FIELDS = ["name", "weekday", "sessionTime", "orderIndex"] as const;
const j = (v: unknown) => JSON.stringify(v ?? null);

function blockName(b: ProgramBlock): string {
  switch (b.type) {
    case "strength": return b.exerciseName;
    case "cardio": return b.activityName;
    case "mobility": return b.drillName;
    case "plugin": return b.name;
    case "circuit": return "Circuit";
    default: return "A block";
  }
}

const blockText = (b: ProgramBlock | undefined) => {
  if (!b) return "Removed";
  if (b.type !== "strength") return blockName(b);
  const w = b.sets.filter((s) => s.setType !== "warmup");
  const f = w[0];
  const reps = f ? (f.reps ?? (f.repsMin != null ? `${f.repsMin}${f.repsMax != null && f.repsMax !== f.repsMin ? `–${f.repsMax}` : ""}` : "")) : "";
  return `${b.exerciseName} ${w.length} × ${reps}`.trim();
};

/**
 * Three-way merge of a program open in the builder: `base` as it was loaded (or last saved),
 * `mine` now, `theirs` as another device saved it since. Things only one side changed come
 * across by themselves; a thing both changed differently is a conflict (mine kept until the
 * coach picks). Works on the built week and the program's own fields; later weeks follow.
 */
export function mergePrograms(base: CoachProgram, mine: CoachProgram, theirs: CoachProgram): MergeResult {
  const taken: string[] = [];
  const conflicts: MergeConflict[] = [];
  let out: CoachProgram = { ...mine };

  for (const f of PROGRAM_FIELDS) {
    const b = j(base[f]), m = j(mine[f]), t = j(theirs[f]);
    if (t === b || t === m) continue;
    if (m === b) {
      out = { ...out, [f]: theirs[f] };
      taken.push(f === "name" ? `the name "${theirs.name}"` : `the ${f === "rule" ? "rule" : f === "description" ? "description" : "start"}`);
    } else conflicts.push({ key: `program:${f}`, label: f === "name" ? "the name" : `the ${f}`, mine: String(mine[f] ?? ""), theirs: String(theirs[f] ?? "") });
  }
  // Length and lighter weeks: theirs when only they changed them.
  if (j(base.weeks.length) !== j(theirs.weeks.length) && j(base.weeks.length) === j(mine.weeks.length)) {
    out = setLength(out, theirs.weeks.length);
    taken.push(`${theirs.weeks.length} weeks`);
  }
  const lighter = (p: CoachProgram) => p.weeks.filter((w) => w.lighter).map((w) => w.weekNumber).sort();
  if (j(lighter(theirs)) !== j(lighter(base)) && j(lighter(mine)) === j(lighter(base))) out = setLighterWeeks(out, lighter(theirs));

  const tB = templateOf(base), tM = templateOf(out), tT = templateOf(theirs);
  const dayIn = (w: ProgramWeek, id: string) => w.days.find((d) => d.id === id);
  const ids = [...new Set([...tM.days, ...tT.days].map((d) => d.id))];
  const days: ProgramDay[] = [];
  for (const id of ids) {
    const b = dayIn(tB, id), m = dayIn(tM, id), t = dayIn(tT, id);
    if (!m && !t) continue;
    if (!m) {
      // Added there (keep), or removed here (stays removed unless they changed it since).
      if (!b) { days.push(t!); taken.push(t!.name ?? "a day"); }
      else if (j(b) !== j(t)) { days.push(t!); taken.push(`${t!.name ?? "a day"} again`); }
      continue;
    }
    if (!t) {
      if (b && j(b) === j(m)) continue; // removed there, unchanged here
      days.push(m);
      continue;
    }
    let day: ProgramDay = { ...m };
    for (const f of DAY_FIELDS) {
      const bv = j(b?.[f]), mv = j(m[f]), tv = j(t[f]);
      if (tv === bv || tv === mv) continue;
      if (mv === bv) {
        day = { ...day, [f]: t[f] };
        const name = t.name ?? "a day";
        taken.push(f === "orderIndex" ? `the order of ${name}` : f === "name" ? `${name} (renamed)` : f === "weekday" ? `${name}'s day` : `${name}'s time`);
      }
      else conflicts.push({ key: `day:${id}:${f}`, label: `${m.name ?? "a day"} (${f === "weekday" ? "day" : f})`, mine: String(m[f] ?? "any"), theirs: String(t[f] ?? "any") });
    }
    day = { ...day, blocks: mergeBlocks(b?.blocks ?? [], m.blocks, t.blocks, day.name ?? "a day", taken, conflicts) };
    days.push(day);
  }
  out = applyTemplate(out, { ...tM, days });
  return { program: out, taken, conflicts };
}

function mergeBlocks(base: ProgramBlock[], mine: ProgramBlock[], theirs: ProgramBlock[], dayName: string, taken: string[], conflicts: MergeConflict[]): ProgramBlock[] {
  const find = (xs: ProgramBlock[], id: string) => xs.find((x) => x.id === id);
  const out: ProgramBlock[] = [];
  for (const m of mine) {
    const b = find(base, m.id), t = find(theirs, m.id);
    if (!t) {
      // Removed there: gone, unless changed here since.
      if (b && j(b) === j(m)) { taken.push(`removed ${blockName(m)} from ${dayName}`); continue; }
      out.push(m);
      continue;
    }
    const bj = j(b), mj = j(m), tj = j(t);
    if (tj === bj || tj === mj) out.push(m);
    else if (mj === bj) { out.push(t); taken.push(`${blockName(t)} on ${dayName}`); }
    else { out.push(m); conflicts.push({ key: `block:${m.id}`, label: `${blockName(m)} on ${dayName}`, mine: blockText(m), theirs: blockText(t) }); }
  }
  // Added there: in their place, after whatever came before it.
  for (const t of theirs) {
    if (find(mine, t.id) || find(base, t.id)) continue;
    const before = theirs.slice(0, theirs.indexOf(t)).reverse().find((x) => out.some((o) => o.id === x.id));
    const at = before ? out.findIndex((o) => o.id === before.id) + 1 : 0;
    out.splice(at, 0, t);
    taken.push(`${blockName(t)} on ${dayName}`);
  }
  return out.map((x, i) => ({ ...x, orderIndex: i }));
}

/** The coach picked "Use the phone's" for a conflict: take theirs for that one thing. */
export function takeTheirs(program: CoachProgram, theirs: CoachProgram, key: string): CoachProgram {
  const [kind, id, field] = key.split(":");
  if (kind === "program") return touchCoachProgram({ ...program, [id!]: theirs[id as keyof CoachProgram] });
  const tT = templateOf(theirs);
  if (kind === "day") {
    const t = tT.days.find((d) => d.id === id);
    return editTemplate(program, (w) => ({ ...w, days: w.days.map((d) => (d.id === id && t ? { ...d, [field!]: t[field as keyof ProgramDay] } : d)) }));
  }
  const tb = tT.days.flatMap((d) => d.blocks).find((b) => b.id === id);
  return editTemplate(program, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id && tb ? { ...tb, orderIndex: b.orderIndex } : b)) })) }));
}
