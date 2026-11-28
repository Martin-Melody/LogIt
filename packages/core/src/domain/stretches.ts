// A program's weeks as stretches (canvas PW1–PW4): a range of weeks, an optional name and what
// they do. One idea for the coach over two stored ones: phases (a range with its own progression,
// or Find your weights) and week types (Deload, Test, their own). Reading and writing go through
// here, so everything that runs a program (phaseAt, weekTypeOf, handoffs) keeps working as it is.
import {
  FIND_YOUR_MAX_PACK, FIND_YOUR_WEIGHTS_PACK, MAX_FINDER_ID, WEIGHT_FINDER_ID, phaseAt, putPhase, ruleLabel, touchCoachProgram, weekRangeText,
  type CoachProgram, type ProgramPhase, type ProgramRule, type WeekRange,
} from "./CoachProgram";
import { weekTypeLabel, weekTypeOf, weekTypeText, type WeekType } from "./weekTypes";

export type StretchWhat =
  /** LogIt's Find your weights: the Weight finder on each lift. */
  | { kind: "find" }
  /** Canvas PX4: Find your max, heavy singles on these lifts (absent = every weighted lift). */
  | { kind: "max"; lifts?: string[] }
  /** A starting phase from a phase pack plugin. */
  | { kind: "pack"; pack: { id: string; name: string }; findsWeights: boolean; blockPluginId?: string; rule?: ProgramRule }
  /** A progression for these weeks; none = the program's own. */
  | { kind: "progression"; rule?: ProgramRule }
  /** A kind of week: Deload, Intro, Heavy, Test, or the coach's own. */
  | { kind: "week"; type: WeekType };

export type StretchInput = WeekRange & { name?: string; what: StretchWhat };
export type Stretch = StretchInput & {
  key: string;
  /** The phase it's stored as, if any. */
  phaseId?: string;
  /** Nothing set: the program's progression. */
  plain: boolean;
};

// A phase's default name (its weeks, "Find your weights", "Find your max", its pack's) isn't one
// the coach gave it: changing what the stretch does shouldn't carry it over.
const named = (p: ProgramPhase) => {
  const defaults = [weekRangeText(p.weeks), p.findsMax ? "Find your max" : "", p.findsWeights ? "Find your weights" : "", p.pack?.name ?? ""];
  return p.name && !defaults.includes(p.name) ? p.name : undefined;
};

/** The program's weeks, in order, as stretches. Every week is in exactly one. */
export function stretchesOf(program: CoachProgram): Stretch[] {
  const n = program.weeks.length;
  const out: Stretch[] = [];
  for (let k = 1; k <= n; k++) {
    const week = program.weeks.find((w) => w.weekNumber === k);
    const t = week ? weekTypeOf(week) : null;
    const ph = phaseAt(program, k);
    let s: Omit<Stretch, "from" | "to">;
    if (t && t.kind !== "find") s = { key: `w:${t.kind}:${t.name ?? ""}`, what: { kind: "week", type: t }, ...(t.name ? { name: t.name } : {}), plain: false };
    else if (ph) {
      const what: StretchWhat = ph.findsMax ? { kind: "max", ...(ph.lifts ? { lifts: ph.lifts } : {}) } : ph.pack && ph.pack.id !== FIND_YOUR_WEIGHTS_PACK.id
        ? { kind: "pack", pack: ph.pack, findsWeights: !!ph.findsWeights, ...(ph.blockPluginId ? { blockPluginId: ph.blockPluginId } : {}), ...(ph.rule ? { rule: ph.rule } : {}) }
        : ph.findsWeights ? { kind: "find" } : { kind: "progression", ...(ph.rule ? { rule: ph.rule } : {}) };
      const name = named(ph);
      s = { key: `p:${ph.id}`, what, ...(name ? { name } : {}), phaseId: ph.id, plain: false };
    } else s = { key: "plain", what: { kind: "progression" }, plain: true };
    const last = out.at(-1);
    if (last && last.key === s.key && last.to === k - 1) last.to = k;
    else out.push({ ...s, from: k, to: k });
  }
  return out;
}

/** Week types in the range go back to normal. */
function clearTypes(program: CoachProgram, r: WeekRange): CoachProgram {
  return {
    ...program,
    weeks: program.weeks.map((w) => {
      if (w.weekNumber < r.from || w.weekNumber > r.to || (!w.type && !w.lighter)) return w;
      const { type: _t, lighter: _l, ...rest } = w;
      return rest;
    }),
  };
}

/** Phases lose the range: one covering it on both sides splits in two (the first keeps its id). */
function clearPhases(program: CoachProgram, r: WeekRange, newId: () => string, only?: (p: ProgramPhase) => boolean): CoachProgram {
  if (!program.phases?.length) return program;
  const phases: ProgramPhase[] = [];
  for (const p of program.phases) {
    if (p.weeks.to < r.from || p.weeks.from > r.to || (only && !only(p))) { phases.push(p); continue; }
    const left = p.weeks.from < r.from ? { ...p, weeks: { from: p.weeks.from, to: r.from - 1 } } : null;
    const right = p.weeks.to > r.to ? { ...p, id: left ? newId() : p.id, weeks: { from: r.to + 1, to: p.weeks.to } } : null;
    for (const part of [left, right]) if (part) phases.push(part.name === weekRangeText(p.weeks) ? { ...part, name: weekRangeText(part.weeks) } : part);
  }
  return { ...program, phases };
}

/** Next-door phases that run the same progression with no name of their own become one (dragging
 * an edge across a deload and back shouldn't leave two "Adaptive" stretches). */
function joinTwins(program: CoachProgram): CoachProgram {
  const sorted = [...(program.phases ?? [])].sort((a, b) => a.weeks.from - b.weeks.from);
  if (sorted.length < 2) return program;
  const handed = new Set((program.handoffs ?? []).map((h) => h.phaseId));
  const same = (a: ProgramPhase, b: ProgramPhase) =>
    a.weeks.to + 1 === b.weeks.from && !a.findsWeights && !b.findsWeights && !a.pack && !b.pack && !a.blockPluginId && !b.blockPluginId
    && !named(a) && !named(b) && JSON.stringify(a.rule ?? null) === JSON.stringify(b.rule ?? null) && !handed.has(b.id);
  const out: ProgramPhase[] = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (last && same(last, p)) { const weeks = { from: last.weeks.from, to: p.weeks.to }; out[out.length - 1] = { ...last, weeks, name: weekRangeText(weeks) }; }
    else out.push(p);
  }
  return out.length === sorted.length ? program : { ...program, phases: out };
}

/** Takes a stretch off: its weeks run the program's progression. A kind of week inside a longer
 * progression (a deload in Adaptive) just stops being that kind of week. */
export function removeStretch(program: CoachProgram, s: Pick<Stretch, "from" | "to" | "what">, newId: () => string): CoachProgram {
  const p = clearTypes(program, s);
  return touchCoachProgram(joinTwins(s.what.kind === "week" ? p : clearPhases(p, s, newId)));
}

/** Sets weeks from–to to a stretch, taking them from whatever had them; `replacing` is the stretch
 * being changed (its weeks the new range no longer covers go back to the program's progression). */
export function putStretch(program: CoachProgram, s: StretchInput, newId: () => string, replacing?: Stretch | null): CoachProgram {
  const n = program.weeks.length;
  const from = Math.max(1, Math.min(n, Math.round(s.from)));
  const to = Math.max(from, Math.min(n, Math.round(s.to)));
  const r = { from, to };
  const name = s.name?.trim() || undefined;
  let p = replacing ? removeStretch(program, replacing, newId) : program;

  if (s.what.kind === "week") {
    // A kind of week sits on top of the progression it's in; only Find your weights gives way.
    p = clearPhases(clearTypes(p, r), r, newId, (x) => !!x.findsWeights);
    const type: WeekType = { ...s.what.type, ...(name ? { name } : {}) };
    return touchCoachProgram({ ...p, weeks: p.weeks.map((w) => (w.weekNumber >= from && w.weekNumber <= to ? { ...w, type } : w)) });
  }
  p = clearPhases(clearTypes(p, r), r, newId);
  // Keep the phase's id when it's the same one being changed (handoffs point at it).
  const id = replacing?.phaseId && !p.phases?.some((x) => x.id === replacing.phaseId) ? replacing.phaseId : newId();
  const w = s.what;
  let phase: ProgramPhase | null = null;
  if (w.kind === "find") phase = { id, name: name ?? "Find your weights", weeks: r, findsWeights: true, blockPluginId: WEIGHT_FINDER_ID, pack: FIND_YOUR_WEIGHTS_PACK };
  else if (w.kind === "max") phase = { id, name: name ?? "Find your max", weeks: r, findsMax: true, blockPluginId: MAX_FINDER_ID, pack: FIND_YOUR_MAX_PACK, ...(w.lifts?.length ? { lifts: w.lifts } : {}) };
  else if (w.kind === "pack") phase = { id, name: name ?? w.pack.name, weeks: r, pack: w.pack, ...(w.findsWeights ? { findsWeights: true } : {}), ...(w.blockPluginId ? { blockPluginId: w.blockPluginId } : {}), ...(w.rule ? { rule: w.rule } : {}) };
  else if (w.rule || name) phase = { id, name: name ?? weekRangeText(r), weeks: r, ...(w.rule ? { rule: w.rule } : {}) };
  return touchCoachProgram(joinTwins(phase ? putPhase(p, phase) : p));
}

/** Stretches the range would take weeks from, other than the one being changed and plain ones. */
export function stretchesCovered(program: CoachProgram, r: WeekRange, except?: Stretch | null): Stretch[] {
  return stretchesOf(program).filter((s) => !s.plain && s.key !== except?.key && s.from <= r.to && r.from <= s.to);
}

/** After the length changes: phases past the end go or end sooner; one that ran to the old end
 * keeps running to the new one. */
export function fitStretches(program: CoachProgram, oldLength: number): CoachProgram {
  const n = program.weeks.length;
  if (!program.phases?.length || n === oldLength) return program;
  const phases = program.phases
    .filter((p) => p.weeks.from <= n)
    .map((p) => (p.weeks.to > n || (n > oldLength && p.weeks.to === oldLength) ? { ...p, weeks: { from: p.weeks.from, to: n } } : p));
  return { ...program, phases };
}

/** What the stretch does, in a few words: "Weight finder", "LogIt Adaptive", "half the sets…". */
export function stretchWhatText(s: Pick<Stretch, "what">, programRule: ProgramRule | undefined): string {
  const w = s.what;
  if (w.kind === "find") return "Weight finder";
  if (w.kind === "max") return w.lifts?.length ? `Heavy singles: ${w.lifts.join(", ")}` : "Heavy singles";
  if (w.kind === "pack") return `From ${w.pack.name}`;
  if (w.kind === "week") return weekTypeText(w.type);
  return ruleLabel(w.rule ?? programRule);
}

/** Its name, or what it is: "Hypertrophy", "Deload", "Find your weights", "Weeks 2–3". */
export function stretchTitle(s: Pick<Stretch, "from" | "to" | "name" | "what">): string {
  if (s.name) return s.name;
  const w = s.what;
  return w.kind === "find" ? "Find your weights" : w.kind === "max" ? "Find your max" : w.kind === "pack" ? w.pack.name : w.kind === "week" ? weekTypeLabel(w.type) : weekRangeText(s);
}
