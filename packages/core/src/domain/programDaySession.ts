// The workout a coach program day starts: one exercise per strength block, one
// (uncompleted) set per prescribed set with the target reps/weight already entered so the
// user just confirms or adjusts. Cardio blocks are added empty. Blocks the coach gave the
// same `supersetGroup` become one superset, whatever its size, unless the coach made it a circuit.
//
// Program data v2 adds circuits (their members, run with the circuit timer), mobility drills
// and plugin blocks. A block this app can't run (a newer type, or one needing a newer app, or a
// plugin that isn't there) is left out, and the day's list says "Update LogIt to see this
// part" (unrunnableBlocks); the rest of the day works.

import { warmupSets } from "./warmup";
import { canRunBlock, inWeek, restText, type ProgramBlock, type ProgramDay, type ProgramPhase, phaseBlock } from "./CoachProgram";
import { circuitRounds, type PlanCell } from "./programPlan";
import { addPluginBlock, repeatLastEntry, setBlockFieldValue, updatePluginBlock, type BlockDeclaration } from "./blockPlugin";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addSet,
  addCardioBlock,
  addMobilityBlock,
  addMobilitySet,
  updateMobilitySet,
  getExercises,
  groupIntoSuperset,
  blockSuperset,
  setGroupSettings,
  type MobilityBlockData,
} from "./workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

function targetReps(set: Extract<ProgramBlock, { type: "strength" }>["sets"][number]): number {
  return set.reps ?? set.repsMin ?? 0;
}

export type ProgramDayOptions = {
  /** This app's version ("1.1.0"); blocks needing a newer one are left out. */
  appVersion?: string | null;
  /** What the rule plans this week for an exercise (programPlan.planForWeek): its weight,
   * reps and number of sets replace the typed ones. */
  plan?: (blockId: string) => PlanCell | null;
  /** The plugin's block declaration, when it's installed and allowed (canvas PG8). */
  pluginBlock?: (pluginId: string) => BlockDeclaration | null;
  /** This week of the program (1-based), for circuits that add a round every two weeks. */
  weekNumber?: number;
  /** The phase this week is in (6.10): its block plugin runs each lift, like the Weight finder. */
  phase?: ProgramPhase | null;
};

/** The blocks of a day this app can't run, for "Update LogIt to see this part". */
export function unrunnableBlocks(day: ProgramDay, opts: ProgramDayOptions = {}): ProgramBlock[] {
  return day.blocks.filter((b) => !canRunBlock(b, opts.appVersion) || (b.type === "plugin" && !opts.pluginBlock?.(b.pluginId)));
}

/** A mobility drill with `count` sets (an L/R pair counts once), each with a hold goal. */
function addDrill(
  session: WorkoutSession,
  drill: { drillName: string; drillId?: string; metric?: MobilityBlockData["metric"]; perSide?: boolean },
  count: number,
  targetSec?: number,
): { session: WorkoutSession; blockId: string } {
  session = addMobilityBlock(session, drill);
  const blockId = session.blocks.at(-1)!.id;
  for (let i = 1; i < count; i++) session = addMobilitySet(session, blockId);
  if (targetSec) {
    const data = session.blocks.at(-1)!.data as MobilityBlockData;
    for (const s of data.sets) session = updateMobilitySet(session, blockId, s.id, { targetSec });
  }
  return { session, blockId };
}

/** The workout a coach program day starts, not yet saved. */
export function programDaySession(day0: ProgramDay, opts: ProgramDayOptions = {}): WorkoutSession {
  const day = withGroupRounds(day0, opts.weekNumber ?? 1);
  let session = createSession();
  const groups = new Map<string, string[]>();
  const skip = new Set(unrunnableBlocks(day, opts).map((b) => b.id));

  // A plugin block that can't run here (not added or not allowed) is a note, so it's still
  // done, just logged by hand (canvas Q4/PG8). Newer block types say "Update LogIt" on the day.
  const notes: string[] = [];
  let findNote = false;
  for (const block of sortByOrderIndex(day.blocks)) {
    // An exercise for part of the program only runs in its weeks (6.7).
    if (opts.weekNumber != null && !inWeek(block, opts.weekNumber)) continue;
    if (skip.has(block.id)) {
      if (block.type === "plugin" && canRunBlock(block, opts.appVersion)) notes.push(pluginNote(block));
      continue;
    }
    if (block.type === "strength" && (block.measure === "time" || block.measure === "distance")) {
      // A hold runs as a timed drill and a carry as distance, the way the workout logs them (6.6).
      const work = sortByOrderIndex(block.sets).filter((s) => s.setType !== "warmup");
      const count = Math.max(1, opts.plan?.(block.id)?.sets ?? work.length);
      const first = work[0];
      if (block.measure === "time") {
        session = addDrill(session, { drillName: block.exerciseName, metric: "hold", perSide: block.perSide }, count, first?.durationSec).session;
      } else {
        session = withPlanned(addCardioBlock(session, block.exerciseName), `${count} × ${first?.distanceM ?? "?"} m${block.perSide ? " each side" : ""}`);
      }
    } else if (block.type === "strength" && opts.phase && phaseBlock(opts.phase) && (block.measure ?? "weight") !== "reps" && liftIn(opts.phase, block.exerciseName) && opts.pluginBlock?.(phaseBlock(opts.phase)!)) {
      // A phase's block runs the lift (canvas SP6): its exercise field is the lift, one entry a
      // set to start; its entries count as sets of the lift (6.1).
      const decl = opts.pluginBlock(phaseBlock(opts.phase)!)!;
      session = addPluginBlock(session, decl);
      const blockId = session.blocks.at(-1)!.id;
      const liftKey = [...decl.blockFields, ...decl.fields].find((f) => f.type === "exercise")?.key;
      if (liftKey) session = updatePluginBlock(session, blockId, decl, setBlockFieldValue(liftKey, block.exerciseName));
      // A max test starts with three singles to work up through; more are a tap away.
      const count = Math.max(opts.phase.findsMax ? 3 : 1, sortByOrderIndex(block.sets).filter((s) => s.setType !== "warmup").length);
      for (let i = 1; i < count; i++) session = updatePluginBlock(session, blockId, decl, repeatLastEntry);
    } else if (block.type === "strength") {
      if (opts.phase?.findsWeights) findNote = true;
      session = addExercise(session, {
        exerciseName: block.exerciseName,
        exerciseId: block.exerciseId,
      });
      const entryId = getExercises(session).at(-1)?.id;
      // The rule's numbers for this week, when it planned some (lighter weeks have fewer sets).
      const cell = opts.plan?.(block.id) ?? null;
      const planned = cell && (cell.source === "rule" || cell.source === "pinned") ? cell : null;
      // Warm-ups the coach planned in or left out (builder round 2); otherwise as typed.
      let ordered = sortByOrderIndex(block.sets);
      if (block.warmups === "off") ordered = ordered.filter((s) => s.setType !== "warmup");
      const working = ordered.filter((s) => s.setType !== "warmup");
      if (block.warmups === "on" && !ordered.some((s) => s.setType === "warmup")) {
        const top = (planned && planned.weight) || working[0]?.weight || 0;
        if (top > 0) ordered = [...warmupSets(top).map((w, i) => ({ id: `${block.id}_w${i}`, orderIndex: -10 + i, setType: "warmup" as const, reps: w.reps, weight: w.weight })), ...ordered];
      }
      const keep = planned?.sets ? new Set(working.slice(0, planned.sets).map((s) => s.id)) : null;
      const plannedReps = planned?.reps ? Number.parseInt(planned.reps, 10) : NaN;
      // A week that adds sets (a week type with + sets) repeats the last working set.
      const extra = planned?.sets && working.length ? Math.max(0, planned.sets - working.length) : 0;
      const sets = [...ordered, ...Array.from({ length: extra }, () => working.at(-1)!)];
      if (entryId) {
        for (const set of sets) {
          if (keep && set.setType !== "warmup" && !keep.has(set.id)) continue;
          const usePlan = planned && set.setType !== "warmup";
          session = addSet(session, entryId, {
            reps: usePlan && Number.isFinite(plannedReps) ? plannedReps : targetReps(set),
            // A bodyweight exercise ("Reps") carries no weight; "+ added weight" is the belt's.
            weight: block.measure === "reps" ? 0 : usePlan && planned!.weight != null ? planned!.weight : (set.weight ?? 0),
            setType: set.setType,
            ...(set.restSec ? { restDurationMs: set.restSec * 1000 } : {}),
          });
        }
      }
    } else if (block.type === "cardio") {
      session = withPlanned(addCardioBlock(session, block.activityName), cardioPlanned(block));
    } else if (block.type === "mobility") {
      const added = addDrill(session, block, Math.max(1, block.sets ?? 1), block.targetSec);
      session = added.session;
      if (block.progressionId) session = { ...session, blocks: session.blocks.map((b) => (b.id === added.blockId ? { ...b, data: { ...(b.data as MobilityBlockData), algorithmId: block.progressionId } } : b)) };
    } else if (block.type === "plugin") {
      const decl = opts.pluginBlock!(block.pluginId)!;
      session = addPluginBlock(session, decl);
      const blockId = session.blocks.at(-1)!.id;
      for (const [key, value] of Object.entries(block.values ?? {})) {
        session = updatePluginBlock(session, blockId, decl, setBlockFieldValue(key, value));
      }
      for (let i = 1; i < Math.min(50, block.entries ?? 1); i++) session = updatePluginBlock(session, blockId, decl, repeatLastEntry);
    } else if (block.type === "circuit") {
      // Each member gets one set per round; then they run as one circuit.
      const rounds = circuitRounds(block, opts.weekNumber ?? 1);
      const ids: string[] = [];
      for (const m of block.members) {
        if (m.durationSec) {
          const added = addDrill(session, { drillName: m.exerciseName, metric: "hold" }, rounds, m.durationSec);
          session = added.session;
          ids.push(added.blockId);
        } else {
          session = addExercise(session, { exerciseName: m.exerciseName, exerciseId: m.exerciseId });
          const entryId = getExercises(session).at(-1)!.id;
          for (let r = 0; r < rounds; r++) session = addSet(session, entryId, { reps: m.reps ?? 0, weight: 0, setType: "normal" });
          ids.push(session.blocks.at(-1)!.id);
        }
      }
      if (ids.length) {
        session = groupIntoSuperset(session, ids, undefined, "circuit");
        const first = session.blocks.find((b) => b.id === ids[0]);
        const supersetId = first ? blockSuperset(first)?.id : undefined;
        if (supersetId) {
          session = setGroupSettings(session, supersetId, {
            ...(block.memberRestSec != null ? { memberRestMs: block.memberRestSec * 1000 } : {}),
            ...(block.roundRestSec != null ? { roundRestMs: block.roundRestSec * 1000 } : {}),
          });
        }
      }
      continue;
    }
    const group = block.supersetGroup?.trim();
    if (group) groups.set(group, [...(groups.get(group) ?? []), session.blocks.at(-1)!.id]);
  }

  // A group stays a superset whatever its size unless the coach made it a circuit (6.6).
  for (const [gid, ids] of groups) {
    if (ids.length < 2) continue;
    const g = day.groups?.find((x) => x.id === gid);
    session = groupIntoSuperset(session, ids, g?.name, g?.kind ?? "superset");
    const first = session.blocks.find((b) => b.id === ids[0]);
    const sid = first ? blockSuperset(first)?.id : undefined;
    if (sid && g && (g.memberRestSec != null || g.roundRestSec != null)) {
      session = setGroupSettings(session, sid, {
        ...(g.memberRestSec != null ? { memberRestMs: g.memberRestSec * 1000 } : {}),
        ...(g.roundRestSec != null ? { roundRestMs: g.roundRestSec * 1000 } : {}),
      });
    }
  }
  // Without the phase's block on this phone, a find week still says what to do.
  if (findNote) notes.unshift("Find your weights: go up each set until you could only have done 1 or 2 more reps. That set is the one that counts.");
  return notes.length ? { ...session, note: notes.join("\n") } : session;
}

/** A phase's block runs on its lifts only (a max test on the big three); others run as usual. */
const liftIn = (phase: { lifts?: string[] }, name: string) => !phase.lifts || phase.lifts.some((l) => l.trim().toLowerCase() === name.trim().toLowerCase());

/** A group that adds a round every two weeks (6.6 r2): its members get the extra sets. */
function withGroupRounds(day: ProgramDay, week: number): ProgramDay {
  const extra = Math.floor((week - 1) / 2);
  const adding = new Set((day.groups ?? []).filter((g) => g.progression === "add-round").map((g) => g.id));
  if (!extra || !adding.size) return day;
  return {
    ...day,
    blocks: day.blocks.map((b) => {
      if (!b.supersetGroup || !adding.has(b.supersetGroup)) return b;
      if (b.type === "mobility") return { ...b, sets: (b.sets ?? 1) + extra };
      if (b.type !== "strength") return b;
      const last = [...b.sets].sort((x, y) => x.orderIndex - y.orderIndex).at(-1);
      return last ? { ...b, sets: [...b.sets, ...Array.from({ length: extra }, (_, i) => ({ ...last, id: `${last.id}_r${i + 1}`, orderIndex: last.orderIndex + i + 1 }))] } : b;
    }),
  };
}

/** The last block added, with what the program planned for it in words. */
function withPlanned(session: WorkoutSession, planned: string): WorkoutSession {
  if (!planned) return session;
  const last = session.blocks.at(-1)!;
  return { ...session, blocks: [...session.blocks.slice(0, -1), { ...last, data: { ...(last.data as object), planned } } as typeof last] };
}

/** "20 min · 5 km", "6 × 1:00 hard, 2:00 easy · zone 2". */
export function cardioPlanned(b: Extract<ProgramBlock, { type: "cardio" }>): string {
  const bits: string[] = [];
  if (b.intervals) bits.push(`${b.intervals.repeat} × ${restText(b.intervals.workSec)}${b.intervals.easySec ? `, ${restText(b.intervals.easySec)} easy` : ""}`);
  if (b.targetDurationSec) bits.push(`${Math.round(b.targetDurationSec / 60)} min`);
  if (b.targetDistanceM) bits.push(`${b.targetDistanceM / 1000} km`);
  if (b.effort?.trim()) bits.push(b.effort.trim());
  return bits.join(" · ");
}

/** "From your program: EMOM timer · Minutes 10, Exercise Push-up, Reps 8" */
function pluginNote(b: Extract<ProgramBlock, { type: "plugin" }>): string {
  if (b.settingsText) return `From your program: ${b.name} · ${b.settingsText}`;
  const vals = Object.entries(b.values ?? {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : String(v)}`);
  return `From your program: ${b.name}${vals.length ? ` · ${vals.join(", ")}` : ""}`;
}
