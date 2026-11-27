// Exercise swaps in workouts from a coach's program. The coach picks one rule for all
// clients (and can set a client differently, server-side); each program exercise can carry
// approved alternatives (CoachProgram's ProgramStrength.alternatives, copied onto the
// workout's plan as PlannedItem.alternatives). The phone enforces the rule, since workouts
// are logged there, offline too. Workouts the client plans themselves are never limited.

import type { Exercise } from "./exercise";
import type { LibraryEntry } from "./library";
import type { LastingSwap, StrengthBlockData, WorkoutSession } from "./workout";
import type { CoachProgram, ProgramDay } from "./CoachProgram";
import { comparePlan } from "./sessionHistory";

export type SwapRule = "any" | "muscles" | "list";

export const SWAP_RULES: { key: SwapRule; label: string; help: string }[] = [
  { key: "any", label: "Any exercise", help: "Swap to anything, like today." },
  { key: "muscles", label: "Same muscles only", help: "Your alternatives, plus exercises that work the same main muscles." },
  { key: "list", label: "Only my list", help: "Just the alternatives you add to each exercise." },
];

export function swapRuleLabel(rule: SwapRule): string {
  return SWAP_RULES.find((r) => r.key === rule)?.label ?? "Any exercise";
}

export function isSwapRule(v: unknown): v is SwapRule {
  return v === "any" || v === "muscles" || v === "list";
}

/** Why a swap is allowed: on the coach's list, works the same muscles, or anything goes. */
export type SwapWhy = "list" | "muscles" | "any";

export type SwapVerdict =
  | { allowed: true; why: SwapWhy }
  | { allowed: false; why: "not-listed" | "not-same-muscles" };

export type SwapAlt = { name: string; exerciseId?: string };

/** The exercise being swapped out: what the plan said, with the coach's alternatives. */
export type SwapTarget = { name: string; exerciseId?: string; alternatives?: SwapAlt[] };

const norm = (s: string) => s.trim().toLowerCase();

function strengthOf(library: LibraryEntry[], ref: { name: string; exerciseId?: string; id?: string }): Exercise | undefined {
  const id = ref.exerciseId ?? ref.id;
  const byId = id ? library.find((e) => e.kind === "strength" && e.item.id === id) : undefined;
  const hit = byId ?? library.find((e) => e.kind === "strength" && norm(e.item.name) === norm(ref.name));
  return hit?.kind === "strength" ? hit.item : undefined;
}

/** `candidate` works `planned`'s main muscle (its first primary one): Leg press and Leg
 * extension for Squat (quads), not Romanian deadlift, which only shares the glutes.
 * Unknown muscles never match. */
export function sameMainMuscles(planned: Exercise | undefined, candidate: Exercise | undefined): boolean {
  const main = planned?.primaryMuscles[0];
  return !!main && !!candidate?.primaryMuscles.includes(main);
}

export function onCoachList(target: SwapTarget, candidate: { name: string; id?: string }): boolean {
  return (target.alternatives ?? []).some((a) =>
    (a.exerciseId && candidate.id ? a.exerciseId === candidate.id : false) || norm(a.name) === norm(candidate.name));
}

/** May the client swap `target` for `candidate` under `rule`? */
export function swapVerdict(
  rule: SwapRule,
  target: SwapTarget,
  candidate: { name: string; id?: string },
  library: LibraryEntry[],
): SwapVerdict {
  if (onCoachList(target, candidate)) return { allowed: true, why: "list" };
  if (rule === "any") return { allowed: true, why: "any" };
  if (rule === "list") return { allowed: false, why: "not-listed" };
  return sameMainMuscles(strengthOf(library, target), strengthOf(library, candidate))
    ? { allowed: true, why: "muscles" }
    : { allowed: false, why: "not-same-muscles" };
}

export type SwapChoice = { name: string; id?: string; detail: string; verdict: SwapVerdict };

export type SwapChoices = {
  /** The coach's alternatives, in the coach's order. */
  fromCoach: SwapChoice[];
  /** "muscles" rule, no search yet: exercises for the same main muscles. */
  sameMuscles: SwapChoice[];
  /** What the search found, allowed or not (not-allowed ones are shown greyed). */
  results: SwapChoice[];
};

const MAX_SUGGESTIONS = 12;
const MAX_RESULTS = 40;

function musclesDetail(e: Exercise | undefined): string {
  return e?.primaryMuscles.join(", ") ?? "";
}

/** What the swap sheet lists. Without a search: the coach's picks, then (for "muscles")
 * same-muscle suggestions. With one: every matching strength exercise with its verdict. */
export function swapChoices(
  rule: SwapRule,
  target: SwapTarget,
  library: LibraryEntry[],
  query = "",
): SwapChoices {
  const planned = strengthOf(library, target);
  const isTarget = (e: Exercise) => (target.exerciseId ? e.id === target.exerciseId : false) || norm(e.name) === norm(target.name);
  const q = norm(query);

  const fromCoach: SwapChoice[] = (target.alternatives ?? [])
    .filter((a) => !q || norm(a.name).includes(q))
    .map((a) => {
      const ex = strengthOf(library, a);
      return { name: ex?.name ?? a.name, id: ex?.id ?? a.exerciseId, detail: musclesDetail(ex), verdict: { allowed: true, why: "list" } };
    });
  const listed = (e: Exercise) => onCoachList(target, { name: e.name, id: e.id });

  const strength = library.flatMap((e) => (e.kind === "strength" ? [e.item] : [])).filter((e) => !isTarget(e));

  if (!q) {
    const sameMuscles = rule === "muscles"
      ? strength
          .filter((e) => !listed(e) && sameMainMuscles(planned, e))
          // Closest first: more shared main muscles, then alphabetical.
          .sort((a, b) => overlap(planned, b) - overlap(planned, a) || a.name.localeCompare(b.name))
          .slice(0, MAX_SUGGESTIONS)
          .map((e) => ({ name: e.name, id: e.id, detail: musclesDetail(e), verdict: { allowed: true as const, why: "muscles" as const } }))
      : [];
    return { fromCoach, sameMuscles, results: [] };
  }

  const results = strength
    .filter((e) => !listed(e) && norm(e.name).includes(q))
    .sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS)
    .map((e) => ({ name: e.name, id: e.id, detail: musclesDetail(e), verdict: swapVerdict(rule, target, { name: e.name, id: e.id }, library) }))
    // Allowed ones first; the order within each stays.
    .sort((a, b) => Number(b.verdict.allowed) - Number(a.verdict.allowed));
  return { fromCoach, sameMuscles: [], results };
}

function overlap(a: Exercise | undefined, b: Exercise): number {
  return a ? a.primaryMuscles.filter((m) => b.primaryMuscles.includes(m)).length : 0;
}

/** The line under the sheet's title. */
export function swapRuleExplainer(rule: SwapRule, coachName: string, target: SwapTarget): string {
  const hasList = (target.alternatives?.length ?? 0) > 0;
  switch (rule) {
    case "any":
      return hasList ? `Your logged sets stay. ${coachName}'s picks are first, but you can swap to anything.` : "Your logged sets stay.";
    case "muscles":
      return `Your logged sets stay. ${coachName} lets you swap to exercises for the same muscles.`;
    case "list":
      return hasList
        ? `Your logged sets stay. ${coachName} only allows the swaps on their list.`
        : `${coachName} only allows the swaps on their list, and there aren't any for this one yet.`;
  }
}

export function blockedLabel(verdict: SwapVerdict, coachName: string): string {
  return verdict.why === "not-same-muscles" ? "Not the same muscles" : `Not on ${coachName}'s list`;
}

/** The message "Ask <coach> to swap" writes for the client. */
export function askToSwapMessage(from: string, to?: string): string {
  return to?.trim()
    ? `Can I swap ${from} for ${to.trim()} today?`
    : `Can I swap ${from} for something else today?`;
}

/** The planned exercise a workout block stands for, with the coach's alternatives; null when
 * the block isn't from a coach program's plan (their own additions swap freely). */
export function swapTargetFor(session: WorkoutSession, blockId: string): SwapTarget | null {
  if (session.source?.kind !== "program") return null;
  const row = comparePlan(session)?.rows.find((r) => r.block?.id === blockId);
  if (!row || row.item.type !== "strength") return null;
  return { name: row.item.name, exerciseId: row.item.exerciseId, alternatives: row.item.alternatives };
}

// ── For the coach: swaps in a client's workouts ────────────────────────────────

export type ProgramSwap = {
  sessionId: string;
  startedAtMs: number;
  planned: string;
  didInstead: string;
  /** "For the rest of the program" (canvas SW1), and the reason they gave. */
  lasting?: boolean;
  reason?: string;
  /** Worked out from the plan's alternatives and the library: on the coach's list, the same
   * main muscles, or neither (the rule allowed anything then, or an older app swapped). */
  why: "list" | "muscles" | "other";
};

/** Every swap in the client's workouts from coach programs, newest first. */
export function programSwaps(
  sessions: WorkoutSession[],
  library: LibraryEntry[],
  opts: { sinceMs?: number; coachId?: string } = {},
): ProgramSwap[] {
  const out: ProgramSwap[] = [];
  for (const s of sessions) {
    if (s.source?.kind !== "program") continue;
    if (opts.sinceMs != null && s.startedAtMs < opts.sinceMs) continue;
    if (opts.coachId && s.source.coachId && s.source.coachId !== opts.coachId) continue;
    for (const row of comparePlan(s)?.rows ?? []) {
      if (row.status !== "swapped" || row.item.type !== "strength" || !row.block || !row.doneName) continue;
      const target: SwapTarget = { name: row.item.name, exerciseId: row.item.exerciseId, alternatives: row.item.alternatives };
      const doneId = (row.block.data as StrengthBlockData).exerciseId;
      const v = swapVerdict("muscles", target, { name: row.doneName, id: doneId }, library);
      const lasting = s.source.lastingSwaps?.find((l) => l.from.trim().toLowerCase() === row.item.name.trim().toLowerCase());
      out.push({
        sessionId: s.id,
        startedAtMs: s.startedAtMs,
        planned: row.item.name,
        didInstead: row.doneName,
        ...(lasting ? { lasting: true, ...(lasting.reason ? { reason: lasting.reason } : {}) } : {}),
        why: v.allowed && v.why !== "any" ? v.why : "other",
      });
    }
  }
  return out.sort((a, b) => b.startedAtMs - a.startedAtMs);
}

export const SWAP_WHY_LABEL: Record<ProgramSwap["why"], string> = {
  list: "On your list",
  muscles: "Same muscles",
  other: "Not on your list, other muscles",
};


// ── Lasting swaps (canvas SW1, Q8) ───────────────────────────────────────────

/**
 * The client's swaps "for the rest of the program" that still apply: the newest per exercise,
 * from their workouts of this program, unless the coach put it back since (revertedSwaps) or
 * the program no longer has that exercise (the coach kept it, so it says `to` now).
 */
export function activeLastingSwaps(program: CoachProgram, sessions: WorkoutSession[]): LastingSwap[] {
  const has = new Set(program.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.type === "strength").map((b) => (b as { exerciseName: string }).exerciseName.trim().toLowerCase()))));
  const newest = new Map<string, LastingSwap>();
  for (const s of sessions) {
    if (s.source?.kind !== "program" || s.source.parentId !== program.id) continue;
    for (const l of s.source.lastingSwaps ?? []) {
      const key = l.from.trim().toLowerCase();
      if ((newest.get(key)?.atMs ?? -1) < l.atMs) newest.set(key, l);
    }
  }
  return [...newest.entries()]
    .filter(([key, l]) => has.has(key) && !(program.revertedSwaps ?? []).some((r) => r.from.trim().toLowerCase() === key && r.atMs >= l.atMs))
    .map(([, l]) => l);
}

/** A day with the client's lasting swaps in it, for starting it. */
export function applyLastingSwaps(day: ProgramDay, swaps: LastingSwap[]): ProgramDay {
  if (!swaps.length) return day;
  return {
    ...day,
    blocks: day.blocks.map((b) => {
      if (b.type !== "strength") return b;
      const l = swaps.find((x) => x.from.trim().toLowerCase() === b.exerciseName.trim().toLowerCase());
      if (!l) return b;
      const { exerciseId: _id, ...rest } = b;
      return { ...rest, exerciseName: l.to, ...(l.toId ? { exerciseId: l.toId } : {}) };
    }),
  };
}
