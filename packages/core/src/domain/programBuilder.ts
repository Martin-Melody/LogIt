// The program builder (canvas PG2, Z6): the coach builds ONE week of days, and it applies to
// every week. A block keeps the same id in every week; a later week keeps its own numbers only
// where the coach typed them over the rule ("pinned", canvas PG3). Everything else follows the
// built week. Saved as you go, with undo, and changes from another device merged in.

import { createId } from "./ids";
import type { WeekType } from "./weekTypes";
import { libraryBaseOf, touchCoachProgram, updateCopyFromTemplate, type CoachProgram, type ProgramBlock, type ProgramDay, type ProgramSet, type ProgramWeek } from "./CoachProgram";

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
  return sameShape(program) ?? mergeWeeks(program);
}

/** Weeks with different exercises (canvas PB7): one day of all of them, each with the weeks it
 * runs in, so the program opens in the builder instead of week by week. Null when the weeks
 * can't be one (a different number of days, sets or an exercise that comes and goes). */
function mergeWeeks(program: CoachProgram): CoachProgram | null {
  const weeks = byWeek(program.weeks);
  const t = weeks[0];
  if (!t) return null;
  const tDays = byOrder(t.days);
  if (weeks.some((w) => w.days.length !== tDays.length)) return null;
  const key = (b: ProgramBlock) => (b.type === "strength" ? `s:${b.exerciseName.trim().toLowerCase()}` : shape(b));
  const out: ProgramDay[][] = weeks.map(() => []);
  for (let i = 0; i < tDays.length; i++) {
    const order: string[] = [];
    const first = new Map<string, ProgramBlock>();
    const present = new Map<string, number[]>();
    const perWeek: Map<string, ProgramBlock>[] = [];
    for (const w of weeks) {
      const list = byOrder(byOrder(w.days)[i]!.blocks);
      const counts = new Map<string, number>();
      const keys = list.map((b) => { const k0 = key(b); const n = (counts.get(k0) ?? 0) + 1; counts.set(k0, n); return `${k0}#${n}`; });
      const m = new Map<string, ProgramBlock>();
      keys.forEach((k, j) => {
        m.set(k, list[j]!);
        present.set(k, [...(present.get(k) ?? []), w.weekNumber]);
        if (first.has(k)) return;
        first.set(k, list[j]!);
        // In the same place: after the one before it this week, else before the next known one.
        const prev = j > 0 ? keys[j - 1]! : null;
        const next = keys.slice(j + 1).find((x) => order.includes(x));
        const at = prev && order.includes(prev) ? order.indexOf(prev) + 1 : next ? order.indexOf(next) : order.length;
        order.splice(at, 0, k);
      });
      perWeek.push(m);
    }
    for (const k of order) {
      const ns = present.get(k)!;
      if (ns.some((n, j) => j > 0 && n !== ns[j - 1]! + 1)) return null;
      const f = first.get(k)!;
      for (const m of perWeek) {
        const b = m.get(k);
        if (b && f.type === "strength" && b.type === "strength" && b.sets.length !== f.sets.length) return null;
      }
    }
    weeks.forEach((_w, wi) => {
      const blocks = order.map((k, idx) => {
        const f = first.get(k)!;
        const ns = present.get(k)!;
        const y = perWeek[wi]!.get(k);
        let b: ProgramBlock = { ...f, orderIndex: idx };
        if (y && f.type === "strength" && y.type === "strength") {
          const fs = byOrder(f.sets), ys = byOrder(y.sets);
          b = { ...b, sets: fs.map((s, j) => (sameNumbers(s, ys[j]!) && !ys[j]!.pinned ? s : { ...pick(ys[j]!), id: s.id, orderIndex: s.orderIndex, pinned: true })) } as ProgramBlock;
        }
        const { weeks: _r, ...rest } = b;
        return (ns.length === weeks.length ? rest : { ...rest, weeks: { from: ns[0]!, to: ns.at(-1)! } }) as ProgramBlock;
      });
      out[wi]!.push({ ...tDays[i]!, blocks });
    });
  }
  return { ...program, weeks: weeks.map((w, wi) => ({ ...w, days: out[wi]! })) };
}

function sameShape(program: CoachProgram): CoachProgram | null {
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
      if (i === 0) {
        const { lighter: _l, type: _t, ...rest } = template;
        return { ...rest, weekNumber: w.weekNumber, id: w.id, ...(w.lighter ? { lighter: true } : {}), ...(w.type ? { type: w.type } : {}) };
      }
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

/** A week's type (Phase 6.4): Deload, Test, the coach's own; null or normal = a normal week.
 * Replaces the old lighter flag on that week. */
export function setWeekType(program: CoachProgram, weekNumber: number, type: WeekType | null): CoachProgram {
  return touchCoachProgram({
    ...program,
    weeks: program.weeks.map((w) => {
      if (w.weekNumber !== weekNumber) return w;
      const { lighter: _l, type: _t, ...rest } = w;
      return type && type.kind !== "normal" ? { ...rest, type } : rest;
    }),
  });
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
  // Week types the same way: theirs when only they changed them.
  const types = (p: CoachProgram) => byWeek(p.weeks).map((w) => w.type ?? null);
  if (j(types(theirs)) !== j(types(base)) && j(types(out)) === j(types(base))) {
    for (const w of theirs.weeks) out = setWeekType(out, w.weekNumber, w.type ?? null);
  }

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
  out = mergePins(base, mine, theirs, out, taken, conflicts);
  return { program: out, taken, conflicts };
}

/** A later week's typed-over numbers (canvas PG3): theirs when only they changed them. */
function mergePins(base: CoachProgram, mine: CoachProgram, theirs: CoachProgram, out: CoachProgram, taken: string[], conflicts: MergeConflict[]): CoachProgram {
  const setAt = (p: CoachProgram, week: number, blockId: string, setId: string) => {
    const w = p.weeks.find((x) => x.weekNumber === week);
    for (const d of w?.days ?? []) for (const b of d.blocks) if (b.id === blockId && b.type === "strength") return b.sets.find((s) => s.id === setId);
    return undefined;
  };
  const pinText = (s: ProgramSet | undefined) => (s?.pinned ? j(Object.fromEntries(NUMBERS.map((k) => [k, s[k]]))) : "rule");
  let next = out;
  const seen = new Set<string>();
  for (const w of next.weeks) {
    if (w.weekNumber === templateOf(next).weekNumber) continue;
    for (const d of w.days) for (const b of d.blocks) {
      if (b.type !== "strength") continue;
      for (const s of b.sets) {
        const bs = pinText(setAt(base, w.weekNumber, b.id, s.id)), ms = pinText(setAt(mine, w.weekNumber, b.id, s.id));
        const ts = setAt(theirs, w.weekNumber, b.id, s.id);
        const tt = pinText(ts);
        if (tt === bs || tt === ms) continue;
        const key = `pin:${w.weekNumber}:${b.id}`;
        if (ms !== bs) {
          if (!seen.has(key)) conflicts.push({ key, label: `${b.exerciseName}, week ${w.weekNumber}`, mine: ms === "rule" ? "the rule's numbers" : "your numbers", theirs: tt === "rule" ? "the rule's numbers" : "the other numbers" });
          seen.add(key);
          continue;
        }
        next = {
          ...next,
          weeks: next.weeks.map((x) => (x.weekNumber !== w.weekNumber ? x : {
            ...x, days: x.days.map((dd) => ({ ...dd, blocks: dd.blocks.map((bb) => (bb.id !== b.id || bb.type !== "strength" ? bb : { ...bb, sets: bb.sets.map((ss) => (ss.id === s.id && ts ? { ...ts } : ss)) })) })),
          })),
        };
        if (!seen.has(key)) taken.push(`${b.exerciseName}, week ${w.weekNumber}`);
        seen.add(key);
      }
    }
  }
  return next;
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
  if (kind === "pin") {
    // key "pin:<week>:<blockId>": that week's sets of that exercise, as they have them.
    const week = Number(id);
    const from = theirs.weeks.find((w) => w.weekNumber === week);
    const tb = from?.days.flatMap((d) => d.blocks).find((b) => b.id === field);
    return touchCoachProgram({ ...program, weeks: program.weeks.map((w) => (w.weekNumber !== week || !tb ? w : { ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === field ? { ...tb, orderIndex: b.orderIndex } : b)) })) })) });
  }
  if (kind === "program") return touchCoachProgram({ ...program, [id!]: theirs[id as keyof CoachProgram] });
  const tT = templateOf(theirs);
  if (kind === "day") {
    const t = tT.days.find((d) => d.id === id);
    return editTemplate(program, (w) => ({ ...w, days: w.days.map((d) => (d.id === id && t ? { ...d, [field!]: t[field as keyof ProgramDay] } : d)) }));
  }
  const tb = tT.days.flatMap((d) => d.blocks).find((b) => b.id === id);
  return editTemplate(program, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id && tb ? { ...tb, orderIndex: b.orderIndex } : b)) })) }));
}

// ── Library → clients' copies (canvas Q6) ──

export type CopyUpdate = {
  program: CoachProgram;
  /** The library's changes it took in. */
  taken: string[];
  /** What was changed for this client and kept, where the library changed it too. */
  kept: string[];
  /** Made before copies remembered their library version: replaced by it instead (their
   * start, the week they're on and everything they logged stay). */
  replaced: boolean;
};

/** The copy as its library program was when it was made or last updated. */
function baseOf(copy: CoachProgram): CoachProgram | null {
  const b = copy.libraryBase;
  return b ? { ...copy, ...b } : null;
}
/** The library now, as this copy would have it (its own id, start and links). */
function asCopy(copy: CoachProgram, library: CoachProgram): CoachProgram {
  return { ...copy, name: library.name, description: library.description, lengthWeeks: library.lengthWeeks, rule: library.rule, weeks: library.weeks, updatedAtMs: library.updatedAtMs };
}
const shaped = (...ps: CoachProgram[]) => ps.every((p) => forBuilder(p) !== null);

/** What the library changed since this copy last took it ("Lateral Raise on Upper A", …). */
export function libraryChanges(copy: CoachProgram, library: CoachProgram): string[] {
  const base = baseOf(copy);
  if (!base || !shaped(base, library)) return [];
  return mergePrograms(base, base, asCopy(copy, library)).taken;
}

/** What's been changed for this client since the copy last took the library. */
export function copyOwnChanges(copy: CoachProgram): string[] {
  const base = baseOf(copy);
  if (!base || !shaped(base, copy)) return [];
  return mergePrograms(base, base, copy).taken;
}

/** The copy with the library's changes in it; anything changed for this client stays (canvas Q6). */
export function updateCopy(copy: CoachProgram, library: CoachProgram): CopyUpdate {
  const base = baseOf(copy);
  const theirs = asCopy(copy, library);
  const fresh = { libraryBase: libraryBaseOf(library) };
  if (!base || !shaped(base, copy, library)) {
    return { program: { ...updateCopyFromTemplate(copy, library), ...fresh }, taken: [], kept: [], replaced: true };
  }
  const merged = mergePrograms(base, copy, theirs);
  return { program: touchCoachProgram({ ...merged.program, ...fresh }), taken: merged.taken, kept: merged.conflicts.map((c) => c.label), replaced: false };
}
