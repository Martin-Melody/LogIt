// The workout a coach program day starts: one exercise per strength block, one
// (uncompleted) set per prescribed set with the target reps/weight already entered so the
// user just confirms or adjusts. Cardio blocks are added empty. Blocks the coach gave the
// same `supersetGroup` become one superset (two) or circuit (more).
//
// Program data v2 adds circuits (their members, run with the circuit timer), mobility drills
// and plugin blocks. A block this app can't run (a newer type, or one needing a newer app, or a
// plugin that isn't there) is left out, and the day's list says "Update LogIt to see this
// part" (unrunnableBlocks); the rest of the day works.

import { canRunBlock, type ProgramBlock, type ProgramDay } from "./CoachProgram";
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
export function programDaySession(day: ProgramDay, opts: ProgramDayOptions = {}): WorkoutSession {
  let session = createSession();
  const groups = new Map<string, string[]>();
  const skip = new Set(unrunnableBlocks(day, opts).map((b) => b.id));

  // A plugin block that can't run here (not added or not allowed) is a note, so it's still
  // done, just logged by hand (canvas Q4/PG8). Newer block types say "Update LogIt" on the day.
  const notes: string[] = [];
  for (const block of sortByOrderIndex(day.blocks)) {
    if (skip.has(block.id)) {
      if (block.type === "plugin" && canRunBlock(block, opts.appVersion)) notes.push(pluginNote(block));
      continue;
    }
    if (block.type === "strength") {
      session = addExercise(session, {
        exerciseName: block.exerciseName,
        exerciseId: block.exerciseId,
      });
      const entryId = getExercises(session).at(-1)?.id;
      // The rule's numbers for this week, when it planned some (lighter weeks have fewer sets).
      const cell = opts.plan?.(block.id) ?? null;
      const planned = cell && (cell.source === "rule" || cell.source === "pinned") ? cell : null;
      const ordered = sortByOrderIndex(block.sets);
      const working = ordered.filter((s) => s.setType !== "warmup");
      const keep = planned?.sets ? new Set(working.slice(0, planned.sets).map((s) => s.id)) : null;
      const plannedReps = planned?.reps ? Number.parseInt(planned.reps, 10) : NaN;
      if (entryId) {
        for (const set of ordered) {
          if (keep && set.setType !== "warmup" && !keep.has(set.id)) continue;
          const usePlan = planned && set.setType !== "warmup";
          session = addSet(session, entryId, {
            reps: usePlan && Number.isFinite(plannedReps) ? plannedReps : targetReps(set),
            weight: usePlan && planned!.weight != null ? planned!.weight : (set.weight ?? 0),
            setType: set.setType,
          });
        }
      }
    } else if (block.type === "cardio") {
      session = addCardioBlock(session, block.activityName);
    } else if (block.type === "mobility") {
      session = addDrill(session, block, Math.max(1, block.sets ?? 1), block.targetSec).session;
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

  for (const ids of groups.values()) {
    if (ids.length >= 2) session = groupIntoSuperset(session, ids);
  }
  return notes.length ? { ...session, note: notes.join("\n") } : session;
}

/** "From your program: EMOM timer · Minutes 10, Exercise Push-up, Reps 8" */
function pluginNote(b: Extract<ProgramBlock, { type: "plugin" }>): string {
  if (b.settingsText) return `From your program: ${b.name} · ${b.settingsText}`;
  const vals = Object.entries(b.values ?? {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : String(v)}`);
  return `From your program: ${b.name}${vals.length ? ` · ${vals.join(", ")}` : ""}`;
}
