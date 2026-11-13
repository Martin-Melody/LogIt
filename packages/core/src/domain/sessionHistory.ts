/**
 * What the Sessions pages say about past workouts: their names, what changed since the
 * last time, how they went against the plan they started from, search, and turning one
 * back into a split day. Pure functions over sessions; the pages load the data.
 */
import { createId } from "./ids";
import { estimated1RM } from "./oneRepMax";
import type { MuscleGroup } from "./exercise";
import type { ProgramDay } from "./CoachProgram";
import type { PlannedBlock, PlannedGroup, SplitDay, WorkoutSplit } from "./WorkoutSplit";
import { plannedBlockName } from "./WorkoutSplit";
import { dayNumber as splitDayNumber, splitDayName } from "./splitSchedule";
import {
  blockDisplayName,
  blockGroup,
  isContinuationSet,
  mobilitySetGroups,
  type CardioBlockData,
  type MobilityBlockData,
  type MobilitySet,
  type PlannedItem,
  type SessionBlock,
  type SessionSource,
  type SetEntry,
  type StrengthBlockData,
  type WorkoutSession,
} from "./workout";

const EPS = 1e-6;

function byOrder<T extends { orderIndex: number }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => a.orderIndex - b.orderIndex);
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

// ── Where it came from ──────────────────────────────────────────────────────

/** The plan a workout starts from, kept on the session (see `SessionSource.plan`). */
export function planSnapshot(session: WorkoutSession): PlannedItem[] {
  return byOrder(session.blocks).flatMap((b): PlannedItem[] => {
    const groupId = blockGroup(b)?.id;
    const group = groupId ? { groupId } : {};
    if (b.type === "strength") {
      const d = b.data as StrengthBlockData;
      return [{
        blockId: b.id,
        type: "strength",
        name: d.exerciseName,
        ...(d.exerciseId ? { exerciseId: d.exerciseId } : {}),
        ...group,
        sets: byOrder(d.sets).map((s) => ({
          setType: s.setType,
          reps: s.target?.reps ?? s.reps,
          ...(s.target?.repsMax != null ? { repsMax: s.target.repsMax } : {}),
          weight: s.target?.weight ?? s.weight,
        })),
      }];
    }
    if (b.type === "cardio") {
      return [{ blockId: b.id, type: "cardio", name: (b.data as CardioBlockData).activityName, ...group }];
    }
    if (b.type === "mobility") {
      const d = b.data as MobilityBlockData;
      const rounds = mobilitySetGroups(d);
      const first = byOrder(d.sets)[0];
      return [{
        blockId: b.id,
        type: "mobility",
        name: d.drillName,
        ...group,
        rounds: rounds.length,
        ...(d.metric === "hold" && first?.targetSec ? { targetSec: first.targetSec } : {}),
        ...(d.metric === "reps" && first?.reps ? { targetReps: first.reps } : {}),
      }];
    }
    return [];
  });
}

/** A split day as a workout's source; `planned` is the workout as the plan screen built it. */
export function sourceFromSplitDay(
  split: Pick<WorkoutSplit, "id" | "name" | "days">,
  day: SplitDay,
  planned?: WorkoutSession,
): SessionSource {
  const n = splitDayNumber(split, day.id);
  return {
    kind: "split",
    parentId: split.id,
    parentName: split.name,
    dayId: day.id,
    dayName: splitDayName(split, day),
    ...(n != null ? { dayNumber: n } : {}),
    ...(planned ? { plan: planSnapshot(planned) } : {}),
  };
}

export function sourceFromProgramDay(
  program: { id: string; name: string },
  day: Pick<ProgramDay, "id" | "name" | "orderIndex">,
  planned?: WorkoutSession,
): SessionSource {
  return {
    kind: "program",
    parentId: program.id,
    parentName: program.name,
    dayId: day.id,
    dayName: day.name?.trim() || `Day ${day.orderIndex + 1}`,
    dayNumber: day.orderIndex + 1,
    ...(planned ? { plan: planSnapshot(planned) } : {}),
  };
}

// ── Names ───────────────────────────────────────────────────────────────────

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  forearms: "Forearms",
};

/** "Legs", "Push", "Chest & Back"… from working sets per muscle; null when there are none. */
export function nameFromMuscles(counts: Partial<Record<MuscleGroup, number>>): string | null {
  const c = (m: MuscleGroup) => counts[m] ?? 0;
  const total = (Object.keys(MUSCLE_LABEL) as MuscleGroup[]).reduce((n, m) => n + c(m), 0);
  if (total <= 0) return null;
  const share = (...ms: MuscleGroup[]) => ms.reduce((n, m) => n + c(m), 0) / total;
  const legs = share("quads", "hamstrings", "glutes", "calves");
  if (legs >= 0.7) return "Legs";
  if (share("biceps", "triceps", "forearms") >= 0.7) return "Arms";
  if (share("core") >= 0.7) return "Core";
  if (c("chest") + c("shoulders") > 0 && share("chest", "shoulders", "triceps") >= 0.75) return "Push";
  if (c("back") > 0 && share("back", "biceps", "forearms") >= 0.75) return "Pull";
  if (legs >= 0.3 && share("chest", "back", "shoulders") >= 0.3) return "Full body";
  if (legs <= 0.15 && share("core") < 0.5) return "Upper body";
  const top = (Object.keys(MUSCLE_LABEL) as MuscleGroup[])
    .filter((m) => c(m) > 0)
    .sort((a, b) => c(b) - c(a))
    .slice(0, 2)
    .map((m) => MUSCLE_LABEL[m]);
  return top.join(" & ");
}

export type MusclesOf = (exerciseId: string | undefined, name: string) => MuscleGroup[] | undefined;

/** Working sets that count: logged, not warm-ups, not the tail of a drop set. */
function workingSets(sets: SetEntry[]): SetEntry[] {
  return byOrder(sets).filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType) && (s.reps > 0 || !!s.completed));
}

/** A name made up from what was done, for a workout with no name and no plan. */
export function autoSessionName(session: WorkoutSession, musclesOf?: MusclesOf): string {
  const blocks = byOrder(session.blocks);
  const strength = blocks.filter((b) => b.type === "strength");
  if (strength.length > 0) {
    if (musclesOf) {
      const counts: Partial<Record<MuscleGroup, number>> = {};
      for (const b of strength) {
        const d = b.data as StrengthBlockData;
        const sets = Math.max(1, workingSets(d.sets).length);
        for (const m of musclesOf(d.exerciseId, d.exerciseName) ?? []) counts[m] = (counts[m] ?? 0) + sets;
      }
      const name = nameFromMuscles(counts);
      if (name) return name;
    }
    return (strength[0]!.data as StrengthBlockData).exerciseName;
  }
  if (blocks.length > 0 && blocks.every((b) => b.type === "mobility")) return "Mobility";
  const cardio = blocks.find((b) => b.type === "cardio");
  if (cardio) return (cardio.data as CardioBlockData).activityName;
  return "Workout";
}

export type TitleContext = {
  musclesOf?: MusclesOf;
  /** For a workout from before sessions kept their source: the split day it looks like. */
  inferredDayName?: string | null;
};

/** What a session is called on the Sessions pages. */
export function sessionTitle(session: WorkoutSession, ctx: TitleContext = {}): string {
  return (
    session.name?.trim() ||
    session.source?.dayName ||
    ctx.inferredDayName ||
    autoSessionName(session, ctx.musclesOf)
  );
}

/**
 * The split day an older workout (saved before sessions kept their source) most looks
 * like: at least two of the same exercises and 60% overlap. Only for its name.
 */
export function inferSplitDay(
  session: WorkoutSession,
  splits: readonly WorkoutSplit[],
): { split: WorkoutSplit; day: SplitDay; dayName: string } | null {
  const names = new Set(session.blocks.map((b) => norm(blockDisplayName(b))));
  if (names.size < 2) return null;
  let best: { split: WorkoutSplit; day: SplitDay; score: number } | null = null;
  for (const split of splits) {
    for (const day of split.days) {
      if (day.rest || day.blocks.length === 0) continue;
      const dayNames = new Set(day.blocks.map((b) => norm(plannedBlockName(b))));
      let shared = 0;
      for (const n of names) if (dayNames.has(n)) shared++;
      const score = shared / (names.size + dayNames.size - shared);
      if (shared >= 2 && score >= 0.6 && (!best || score > best.score + EPS)) best = { split, day, score };
    }
  }
  return best ? { split: best.split, day: best.day, dayName: splitDayName(best.split, best.day) } : null;
}

// ── Compared with last time ─────────────────────────────────────────────────

export type BestSet = { weight: number; reps: number };

/** The heaviest working set, most reps breaking a tie. */
export function bestWorkingSet(sets: SetEntry[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of workingSets(sets)) {
    if (s.reps <= 0) continue;
    if (!best || s.weight > best.weight + EPS || (Math.abs(s.weight - best.weight) < EPS && s.reps > best.reps)) {
      best = { weight: s.weight, reps: s.reps };
    }
  }
  return best;
}

export type ChangeKind = "up" | "down" | "same" | "new";

export type LiftChange = {
  kind: ChangeKind;
  /** Strength: kg and reps of the best set against last time's best (0 = unchanged). */
  weightDelta?: number;
  repsDelta?: number;
  /** Mobility: the best hold (s) or reps against last time's. */
  secondsDelta?: number;
  /** Last time's logged sets in order, for the "Last time" column. */
  previousSets?: { setType: SetEntry["setType"]; reps: number; weight: number }[];
  previousSessionId?: string;
};

export type SessionComparison = {
  byBlockId: Record<string, LiftChange>;
  up: number;
  down: number;
  same: number;
  /** Exercises and drills done before (the ones with a change). */
  compared: number;
};

/** Up, down or the same, from the best set now and last time. */
export function compareBest(now: BestSet, prev: BestSet | null | undefined): Pick<LiftChange, "kind" | "weightDelta" | "repsDelta"> {
  if (!prev) return { kind: "new" };
  const weightDelta = Math.abs(now.weight - prev.weight) < EPS ? 0 : now.weight - prev.weight;
  const repsDelta = now.reps - prev.reps;
  let kind: ChangeKind;
  if (weightDelta >= 0 && repsDelta >= 0) kind = weightDelta > 0 || repsDelta > 0 ? "up" : "same";
  else if (weightDelta <= 0 && repsDelta <= 0) kind = "down";
  else {
    // One up, one down (heavier for fewer reps): judge by the estimated max. Bodyweight
    // lifts store the added load, so compare as is.
    const a = estimated1RM(now.weight, now.reps);
    const b = estimated1RM(prev.weight, prev.reps);
    kind = Math.abs(a - b) <= Math.max(Math.abs(b), 1) * 0.005 ? "same" : a > b ? "up" : "down";
  }
  return { kind, weightDelta, repsDelta };
}

function mobilityBest(d: MobilityBlockData): number | null {
  let best: number | null = null;
  for (const s of d.sets) {
    const v = d.metric === "hold" ? s.durationSec : s.reps;
    if (v != null && v > 0 && (best == null || v > best)) best = v;
  }
  return best;
}

type Last = {
  sessionId: string;
  best?: BestSet | null;
  sets?: LiftChange["previousSets"];
  mobility?: number | null;
};

function blockKeys(b: SessionBlock): string[] {
  if (b.type === "strength") {
    const d = b.data as StrengthBlockData;
    return [...(d.exerciseId ? [`s:id:${d.exerciseId}`] : []), `s:name:${norm(d.exerciseName)}`];
  }
  if (b.type === "mobility") {
    const d = b.data as MobilityBlockData;
    return [...(d.drillId ? [`m:id:${d.drillId}:${d.metric}`] : []), `m:name:${norm(d.drillName)}:${d.metric}`];
  }
  return [];
}

/**
 * Every session against the last time each of its exercises and drills was done, oldest
 * first so "last time" is always earlier. Sessions without an end (the running one) are
 * left out.
 */
export function compareSessions(sessions: readonly WorkoutSession[]): Map<string, SessionComparison> {
  const out = new Map<string, SessionComparison>();
  const last = new Map<string, Last>();
  const sorted = sessions.filter((s) => s.endedAtMs != null).sort((a, b) => a.startedAtMs - b.startedAtMs);

  for (const s of sorted) {
    const cmp: SessionComparison = { byBlockId: {}, up: 0, down: 0, same: 0, compared: 0 };
    const updates: [string[], Last][] = [];
    for (const b of byOrder(s.blocks)) {
      const keys = blockKeys(b);
      if (keys.length === 0) continue;
      const prev = keys.map((k) => last.get(k)).find(Boolean);
      if (b.type === "strength") {
        const d = b.data as StrengthBlockData;
        const best = bestWorkingSet(d.sets);
        if (!best) continue;
        const change: LiftChange = { ...compareBest(best, prev?.best) };
        if (prev) {
          change.previousSessionId = prev.sessionId;
          if (prev.sets?.length) change.previousSets = prev.sets;
        }
        cmp.byBlockId[b.id] = change;
        updates.push([keys, {
          sessionId: s.id,
          best,
          sets: byOrder(d.sets)
            .filter((x) => x.reps > 0 || !!x.completed)
            .map((x) => ({ setType: x.setType, reps: x.reps, weight: x.weight })),
        }]);
      } else {
        const value = mobilityBest(b.data as MobilityBlockData);
        if (value == null) continue;
        const change: LiftChange = prev?.mobility != null
          ? {
              kind: value > prev.mobility ? "up" : value < prev.mobility ? "down" : "same",
              secondsDelta: value - prev.mobility,
              previousSessionId: prev.sessionId,
            }
          : { kind: "new" };
        cmp.byBlockId[b.id] = change;
        updates.push([keys, { sessionId: s.id, mobility: value }]);
      }
    }
    for (const c of Object.values(cmp.byBlockId)) {
      if (c.kind === "new") continue;
      cmp.compared++;
      cmp[c.kind]++;
    }
    for (const [keys, entry] of updates) for (const k of keys) last.set(k, entry);
    out.set(s.id, cmp);
  }
  return out;
}

export type HistoryPR = {
  blockId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  /** "weight" = heaviest yet, "reps" = most reps at the heaviest weight yet. */
  kind: "weight" | "reps";
};

/**
 * The PRs each session set, by the same rule as the workout recap (getSessionPRs): an
 * exercise's best working set beat every earlier one. A first time isn't a PR here.
 */
export function historyPRs(sessions: readonly WorkoutSession[]): Map<string, HistoryPR[]> {
  const out = new Map<string, HistoryPR[]>();
  const bestByKey = new Map<string, BestSet>();
  const sorted = sessions.filter((s) => s.endedAtMs != null).sort((a, b) => a.startedAtMs - b.startedAtMs);
  for (const s of sorted) {
    const prs: HistoryPR[] = [];
    const updates: [string[], BestSet][] = [];
    for (const b of byOrder(s.blocks)) {
      if (b.type !== "strength") continue;
      const d = b.data as StrengthBlockData;
      const best = bestWorkingSet(d.sets);
      if (!best) continue;
      const keys = blockKeys(b);
      const prev = keys.map((k) => bestByKey.get(k)).find(Boolean);
      if (prev) {
        if (best.weight > prev.weight + EPS) prs.push({ blockId: b.id, exerciseName: d.exerciseName, ...best, kind: "weight" });
        else if (Math.abs(best.weight - prev.weight) < EPS && best.reps > prev.reps) {
          prs.push({ blockId: b.id, exerciseName: d.exerciseName, ...best, kind: "reps" });
        }
      }
      const top = !prev || best.weight > prev.weight + EPS || (Math.abs(best.weight - prev.weight) < EPS && best.reps > prev.reps) ? best : prev;
      updates.push([keys, top]);
    }
    for (const [keys, best] of updates) for (const k of keys) bestByKey.set(k, best);
    out.set(s.id, prs);
  }
  return out;
}

/** The last time the same workout was done before this one: same split day, else same name. */
export function previousSameWorkout(
  session: WorkoutSession,
  sessions: readonly WorkoutSession[],
  titleOf: (s: WorkoutSession) => string,
): WorkoutSession | null {
  const dayId = session.source?.dayId;
  const title = norm(titleOf(session));
  let best: WorkoutSession | null = null;
  for (const s of sessions) {
    if (s.id === session.id) continue;
    if (s.endedAtMs == null || s.startedAtMs >= session.startedAtMs) continue;
    const same = dayId && s.source?.dayId ? s.source.dayId === dayId : norm(titleOf(s)) === title;
    if (same && (!best || s.startedAtMs > best.startedAtMs)) best = s;
  }
  return best;
}

// ── Against the plan ────────────────────────────────────────────────────────

export type PlanRowStatus = "done" | "beat" | "under" | "skipped" | "swapped";

export type PlanRow = {
  item: PlannedItem;
  status: PlanRowStatus;
  /** The block it became; absent when it was skipped. */
  block?: SessionBlock;
  /** What was done instead, when it was swapped. */
  doneName?: string;
  /** Planned working sets (or rounds) not done, and extra ones done. */
  setsShort: number;
  extraSets: number;
  /** The most any set was under or over its planned weight, kg. */
  kgLighter: number;
  kgHeavier: number;
  /** Reps (or seconds, for a hold) short of the plan, and over it, summed over the sets. */
  repsShort: number;
  repsOver: number;
};

export type PlanComparison = {
  rows: PlanRow[];
  /** Done but not on the plan. */
  added: SessionBlock[];
  /** Rows done as planned or better. */
  followed: number;
};

function loggedMobility(s: MobilitySet | undefined): boolean {
  return !!s && (!!s.completed || (s.durationSec ?? 0) > 0 || (s.reps ?? 0) > 0);
}

/** How the workout went against the plan it started from; null without one. */
export function comparePlan(session: WorkoutSession): PlanComparison | null {
  const plan = session.source?.plan;
  if (!plan?.length) return null;
  const used = new Set<string>();
  const rows: PlanRow[] = [];

  for (const item of plan) {
    const block =
      session.blocks.find((b) => b.id === item.blockId && !used.has(b.id)) ??
      session.blocks.find((b) => !used.has(b.id) && b.type === item.type && norm(blockDisplayName(b)) === norm(item.name));
    const row: PlanRow = { item, status: "done", setsShort: 0, extraSets: 0, kgLighter: 0, kgHeavier: 0, repsShort: 0, repsOver: 0 };
    if (!block) {
      rows.push({ ...row, status: "skipped" });
      continue;
    }
    used.add(block.id);
    row.block = block;
    const doneName = blockDisplayName(block);
    const swapped = norm(doneName) !== norm(item.name);
    if (swapped) row.doneName = doneName;

    let didAnything = true;
    if (item.type === "strength" && block.type === "strength") {
      const planned = (item.sets ?? []).filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType));
      const done = workingSets((block.data as StrengthBlockData).sets).filter((s) => s.reps > 0);
      didAnything = done.length > 0;
      row.setsShort = Math.max(0, planned.length - done.length);
      row.extraSets = Math.max(0, done.length - planned.length);
      for (let i = 0; i < Math.min(planned.length, done.length); i++) {
        const p = planned[i]!;
        const d = done[i]!;
        const dw = d.weight - p.weight;
        if (dw < -EPS) row.kgLighter = Math.max(row.kgLighter, -dw);
        if (dw > EPS) row.kgHeavier = Math.max(row.kgHeavier, dw);
        if (d.reps < p.reps) row.repsShort += p.reps - d.reps;
        const top = p.repsMax ?? p.reps;
        if (d.reps > top) row.repsOver += d.reps - top;
      }
    } else if (item.type === "mobility" && block.type === "mobility") {
      const d = block.data as MobilityBlockData;
      const groups = mobilitySetGroups(d);
      const doneRounds = groups.filter((g) => (g.kind === "single" ? loggedMobility(g.set) : loggedMobility(g.left) || loggedMobility(g.right)));
      didAnything = doneRounds.length > 0;
      row.setsShort = Math.max(0, (item.rounds ?? groups.length) - doneRounds.length);
      row.extraSets = Math.max(0, doneRounds.length - (item.rounds ?? doneRounds.length));
      const target = d.metric === "hold" ? item.targetSec : item.targetReps;
      if (target) {
        for (const s of d.sets.filter(loggedMobility)) {
          const v = (d.metric === "hold" ? s.durationSec : s.reps) ?? 0;
          if (v < target) row.repsShort += target - v;
          if (v > target) row.repsOver += v - target;
        }
      }
    }

    if (swapped) row.status = "swapped";
    else if (!didAnything) row.status = "skipped";
    else if (row.setsShort > 0 || row.kgLighter > 0 || row.repsShort > 0) row.status = "under";
    else if (row.extraSets > 0 || row.kgHeavier > 0 || row.repsOver > 0) row.status = "beat";
    rows.push(row);
  }

  const added = byOrder(session.blocks).filter((b) => !used.has(b.id));
  const followed = rows.filter((r) => r.status === "done" || r.status === "beat").length;
  return { rows, added, followed };
}

export type SplitChanges = {
  /** The day is gone from the split. */
  dayGone: boolean;
  swaps: { from: string; to: string }[];
  added: string[];
  removed: string[];
};

/** How the split day has changed since the plan was taken from it. */
export function splitChangesSince(plan: readonly PlannedItem[], day: SplitDay | null | undefined): SplitChanges {
  if (!day) return { dayGone: true, swaps: [], added: [], removed: [] };
  const was = plan.map((p) => p.name);
  const now = byOrder(day.blocks).map((b: PlannedBlock) => plannedBlockName(b));
  const has = (list: string[], n: string) => list.some((x) => norm(x) === norm(n));
  const removed = was.filter((n) => !has(now, n));
  const added = now.filter((n) => !has(was, n));
  const pairs = Math.min(removed.length, added.length);
  return {
    dayGone: false,
    swaps: removed.slice(0, pairs).map((from, i) => ({ from, to: added[i]! })),
    removed: removed.slice(pairs),
    added: added.slice(pairs),
  };
}

// ── Search ──────────────────────────────────────────────────────────────────

/** The exercises, drills and activities whose names contain `query`, in workout order. */
export function sessionMatches(session: WorkoutSession, query: string): SessionBlock[] {
  const q = norm(query);
  if (!q) return [];
  return byOrder(session.blocks).filter((b) => norm(blockDisplayName(b)).includes(q));
}

// ── Back into a split day ───────────────────────────────────────────────────

function mostCommon(xs: number[]): number | undefined {
  const counts = new Map<number, number>();
  let best: number | undefined;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (best === undefined || n > counts.get(best)! || (n === counts.get(best)! && x > best)) best = x;
  }
  return best;
}

/**
 * A split day with this workout's exercises, drills, activities and groups, set counts and
 * reps from what was done. The weight is only a fallback: the progression plan still sets it.
 */
export function sessionToSplitDay(
  session: WorkoutSession,
  base: Pick<SplitDay, "id" | "orderIndex"> & Partial<Pick<SplitDay, "name" | "weekday" | "sameDayAsPrevious">>,
): SplitDay {
  const groups = new Map<string, PlannedGroup>();
  const blocks: PlannedBlock[] = [];

  for (const b of byOrder(session.blocks)) {
    const info = blockGroup(b);
    let groupId: string | undefined;
    if (info) {
      let g = groups.get(info.id);
      if (!g) {
        g = {
          id: createId("pgroup"),
          rounds: 0,
          ...(info.label ? { label: info.label } : {}),
          ...(info.kind ? { kind: info.kind } : {}),
          ...(info.roundRestMs !== undefined ? { roundRestMs: info.roundRestMs } : {}),
          ...(info.memberRestMs !== undefined ? { memberRestMs: info.memberRestMs } : {}),
          ...(info.leadInMs !== undefined ? { leadInMs: info.leadInMs } : {}),
        };
        groups.set(info.id, g);
      }
      groupId = g.id;
    }
    const orderIndex = blocks.length;
    const grouped = groupId ? { groupId } : {};

    if (b.type === "strength") {
      const d = b.data as StrengthBlockData;
      const logged = workingSets(d.sets).filter((s) => s.reps > 0);
      const sets = logged.length > 0 ? logged : byOrder(d.sets).filter((s) => s.setType !== "warmup");
      const reps = mostCommon(sets.map((s) => s.reps).filter((r) => r > 0));
      const weight = mostCommon(sets.map((s) => s.weight).filter((w) => w > 0));
      if (groupId) groups.get(info!.id)!.rounds = Math.max(groups.get(info!.id)!.rounds, sets.length);
      blocks.push({
        type: "strength",
        id: createId("pex"),
        orderIndex,
        exerciseName: d.exerciseName,
        ...(d.exerciseId ? { exerciseId: d.exerciseId } : {}),
        targets: {
          ...(sets.length ? { sets: sets.length } : {}),
          ...(reps ? { reps } : {}),
          ...(weight ? { weight } : {}),
        },
        ...grouped,
      });
    } else if (b.type === "cardio") {
      blocks.push({ type: "cardio", id: createId("pcardio"), orderIndex, activityName: (b.data as CardioBlockData).activityName, ...grouped });
    } else if (b.type === "mobility") {
      const d = b.data as MobilityBlockData;
      const rounds = mobilitySetGroups(d).length;
      if (groupId) groups.get(info!.id)!.rounds = Math.max(groups.get(info!.id)!.rounds, rounds);
      const values = d.sets.map((s) => (d.metric === "hold" ? s.durationSec ?? s.targetSec : s.reps) ?? 0).filter((v) => v > 0);
      const value = mostCommon(values);
      blocks.push({
        type: "mobility",
        id: createId("pmob"),
        orderIndex,
        drillName: d.drillName,
        ...(d.drillId ? { drillId: d.drillId } : {}),
        metric: d.metric,
        perSide: d.perSide,
        targets: {
          ...(rounds ? { sets: rounds } : {}),
          ...(value && d.metric === "hold" ? { holdSec: value } : {}),
          ...(value && d.metric === "reps" ? { reps: value } : {}),
        },
        ...grouped,
      });
    }
  }

  for (const g of groups.values()) g.rounds = Math.max(1, g.rounds);
  return {
    id: base.id,
    orderIndex: base.orderIndex,
    ...(base.name ? { name: base.name } : {}),
    ...(base.weekday !== undefined ? { weekday: base.weekday } : {}),
    ...(base.sameDayAsPrevious ? { sameDayAsPrevious: true } : {}),
    blocks,
    ...(groups.size ? { groups: [...groups.values()] } : {}),
  };
}
