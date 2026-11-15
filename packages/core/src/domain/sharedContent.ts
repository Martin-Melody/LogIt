// What a social post's attachment carries (its payloadJson) and how it becomes the reader's
// own split, library item or habit ("Copy to mine"). Shared by the phone and the web so a
// post made on one copies the same way on the other. Saving is the caller's job.
import { createId } from "./ids";
import { nowMs } from "./time";
import type { Exercise, ExerciseType, Machine, MuscleGroup } from "./exercise";
import type { CardioActivity } from "./cardioActivity";
import type { MobilityDrill } from "./mobilityDrill";
import type { LibraryItem } from "./library";
import type { Habit, HabitCadence, HabitTone } from "./habit";
import type { MobilityMetric } from "./workout";
import {
  normalizePlannedGroups,
  type PlannedBlock,
  type PlannedGroup,
  type PlannedMobilityTargets,
  type PlannedTargets,
  type SplitDay,
  type WorkoutSplit,
} from "./WorkoutSplit";

// ── Payloads ──────────────────────────────────────────────────────────────────

/** A strength exercise (no `kind`, what every app version has posted), or a cardio activity
 * or mobility drill (with `kind`). Posted as type "Exercise". */
export type SharedExercise = {
  name: string;
  notes?: string | null;
  primaryMuscles?: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  exerciseType?: ExerciseType;
  machines?: Machine[];
  defaultMachineId?: string;
};
export type SharedCardio = { kind: "cardio"; name: string; measures?: CardioActivity["measures"]; cues?: string[]; notes?: string | null };
export type SharedMobility = {
  kind: "mobility";
  name: string;
  area?: MobilityDrill["area"];
  defaultMetric?: MobilityDrill["defaultMetric"];
  perSide?: boolean;
  cues?: string[];
  notes?: string | null;
};
export type SharedLibraryItem = SharedExercise | SharedCardio | SharedMobility;

export type SharedBlock =
  | { type: "strength"; orderIndex: number; exerciseName: string; exerciseId?: string; targets?: PlannedTargets; groupId?: string }
  | { type: "cardio"; orderIndex: number; activityName: string; groupId?: string }
  | {
      type: "mobility";
      orderIndex: number;
      drillName: string;
      drillId?: string;
      metric: MobilityMetric;
      perSide: boolean;
      targets?: PlannedMobilityTargets;
      groupId?: string;
    };

export type SharedSplit = {
  name: string;
  days: {
    name?: string;
    orderIndex: number;
    blocks: SharedBlock[];
    groups?: PlannedGroup[];
    rest?: boolean;
    sameDayAsPrevious?: boolean;
    weekday?: number;
  }[];
  schedule?: WorkoutSplit["schedule"];
  /** Full definitions of every non-LogIt exercise the split uses, so a reader who doesn't have
   * one by that name gets a real copy. LogIt's exercises have the same id everywhere. */
  customExercises: SharedExercise[];
};

export type SharedHabit = {
  name: string;
  cadence: HabitCadence;
  target?: { value: number; unit?: string };
  icon?: string;
  tone?: HabitTone;
};

export type SharedWorkout = { duration?: number; exercises?: { name: string; sets: number }[] };
export type SharedPr = { exerciseName: string; weight?: number; unit?: string; reps?: number };

// ── Building payloads ─────────────────────────────────────────────────────────

export function sharedLibraryItem(entry: LibraryItem): SharedLibraryItem {
  if (entry.kind === "cardio") {
    const c = entry.item;
    return { kind: "cardio", name: c.name, measures: c.measures, cues: c.cues, notes: c.notes ?? undefined };
  }
  if (entry.kind === "mobility") {
    const m = entry.item;
    return {
      kind: "mobility", name: m.name, area: m.area, defaultMetric: m.defaultMetric, perSide: m.perSide,
      cues: m.cues, notes: m.notes ?? undefined,
    };
  }
  const e = entry.item;
  return {
    name: e.name,
    notes: e.notes ?? undefined,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    exerciseType: e.exerciseType,
    machines: e.machines,
    defaultMachineId: e.defaultMachineId,
  };
}

export function sharedSplit(split: WorkoutSplit, customExercises: SharedExercise[]): SharedSplit {
  return {
    name: split.name,
    days: split.days.map((d) => ({
      name: d.name,
      orderIndex: d.orderIndex,
      blocks: d.blocks.map((b): SharedBlock =>
        b.type === "strength"
          ? { type: "strength", orderIndex: b.orderIndex, exerciseName: b.exerciseName, exerciseId: b.exerciseId, targets: b.targets, groupId: b.groupId }
          : b.type === "mobility"
            ? { type: "mobility", orderIndex: b.orderIndex, drillName: b.drillName, drillId: b.drillId, metric: b.metric, perSide: b.perSide, targets: b.targets, groupId: b.groupId }
            : { type: "cardio", orderIndex: b.orderIndex, activityName: b.activityName, groupId: b.groupId },
      ),
      groups: d.groups?.length ? d.groups : undefined,
      rest: d.rest || undefined,
      sameDayAsPrevious: d.sameDayAsPrevious || undefined,
      weekday: d.weekday,
    })),
    schedule: split.schedule,
    customExercises,
  };
}

export function sharedHabit(h: Habit): SharedHabit {
  return { name: h.name, cadence: h.cadence, target: h.target, icon: h.icon, tone: h.tone };
}

// ── Copying ───────────────────────────────────────────────────────────────────

/** The reader's own new library item (new id; never the author's). */
export function libraryItemFromShared(p: SharedLibraryItem): LibraryItem {
  const now = nowMs();
  if ("kind" in p && p.kind === "cardio") {
    return {
      kind: "cardio",
      item: {
        id: createId("cardio"), name: p.name, measures: p.measures === "time" ? "time" : "time-distance",
        cues: p.cues ?? [], notes: p.notes ?? null, isCore: false, createdAtMs: now, updatedAtMs: now,
      },
    };
  }
  if ("kind" in p && p.kind === "mobility") {
    return {
      kind: "mobility",
      item: {
        id: createId("drill"), name: p.name, area: p.area ?? "full-body", defaultMetric: p.defaultMetric === "reps" ? "reps" : "hold",
        perSide: p.perSide === true, cues: p.cues ?? [], notes: p.notes ?? null, isCore: false, createdAtMs: now, updatedAtMs: now,
      },
    };
  }
  const e = p as SharedExercise;
  const exercise: Exercise = {
    id: createId("ex"),
    name: e.name,
    notes: e.notes ?? null,
    isCore: false,
    createdAtMs: now,
    primaryMuscles: e.primaryMuscles ?? [],
    secondaryMuscles: e.secondaryMuscles ?? [],
    exerciseType: e.exerciseType,
    machines: e.machines,
    defaultMachineId: e.defaultMachineId,
  };
  return { kind: "strength", item: exercise };
}

/** The reader's own copy of a shared split. `resolveExerciseId` turns the author's exercise
 * (name + their id) into one of the reader's ids, creating a copy from `customExercises` when
 * needed, or undefined to leave the block name-only. */
export async function splitFromShared(
  p: SharedSplit,
  resolveExerciseId: (name: string, sourceId: string | undefined, custom: SharedExercise | undefined) => Promise<string | undefined>,
): Promise<WorkoutSplit> {
  const customByName = new Map((p.customExercises ?? []).map((e) => [e.name, e]));
  const cache = new Map<string, string | undefined>();
  const resolve = async (name: string, id: string | undefined) => {
    if (!cache.has(name)) cache.set(name, await resolveExerciseId(name, id, customByName.get(name)));
    return cache.get(name);
  };

  const days: SplitDay[] = [];
  for (const d of p.days) {
    const blocks: PlannedBlock[] = [];
    for (const b of d.blocks) {
      const group = b.groupId ? { groupId: b.groupId } : {};
      if (b.type === "strength") {
        blocks.push({
          type: "strength", id: createId("blk"), orderIndex: b.orderIndex, exerciseName: b.exerciseName,
          exerciseId: await resolve(b.exerciseName, b.exerciseId), targets: b.targets, ...group,
        });
      } else if (b.type === "mobility") {
        // Drill ids come from the built-in catalog, the same everywhere.
        blocks.push({
          type: "mobility", id: createId("blk"), orderIndex: b.orderIndex, drillName: b.drillName,
          ...(b.drillId ? { drillId: b.drillId } : {}),
          metric: b.metric === "reps" ? "reps" : "hold", perSide: !!b.perSide,
          ...(b.targets ? { targets: b.targets } : {}), ...group,
        });
      } else {
        blocks.push({ type: "cardio", id: createId("blk"), orderIndex: b.orderIndex, activityName: b.activityName, ...group });
      }
    }
    // A post from an older app has no groups; one with groups keeps them (ids are per day).
    const day: SplitDay = {
      id: createId("day"),
      orderIndex: d.orderIndex,
      name: d.name,
      blocks,
      ...(d.rest ? { rest: true } : {}),
      ...(d.sameDayAsPrevious ? { sameDayAsPrevious: true } : {}),
      ...(typeof d.weekday === "number" && d.weekday >= 0 && d.weekday <= 6 ? { weekday: d.weekday } : {}),
    };
    if (d.groups?.length) day.groups = d.groups;
    days.push(normalizePlannedGroups(day));
  }

  const now = nowMs();
  return {
    id: createId("split"),
    name: p.name,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days,
    ...(p.schedule === "weekdays" ? { schedule: "weekdays" as const } : {}),
  };
}

export function habitFromShared(p: SharedHabit): Habit {
  const now = nowMs();
  return {
    id: createId("habit"), name: p.name, cadence: p.cadence, target: p.target, icon: p.icon, tone: p.tone,
    archived: false, createdAtMs: now, updatedAtMs: now,
  };
}

// ── Showing ───────────────────────────────────────────────────────────────────

/** A shared PR as one line: "200 kg × 1 rep", "100 kg × 5 reps", or "12 reps" with no weight. */
export function prText(weight: number | null | undefined, unit: string | null | undefined, reps: number | null | undefined): string {
  const repsPart = reps ? `${reps} ${reps === 1 ? "rep" : "reps"}` : "";
  if (!weight) return repsPart;
  const load = `${weight} ${unit || "kg"}`;
  return repsPart ? `${load} × ${repsPart}` : load;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function cadenceText(c: HabitCadence | undefined): string {
  if (!c) return "";
  if (c.kind === "daily") return "Every day";
  if (c.kind === "weekly") return `${c.timesPerWeek}× a week`;
  return c.days.map((d) => DAYS[d]).join(", ");
}

/** What a post's attachment card shows: a label ("Personal record"), a title and one detail
 * line. Null when the post has no attachment or its payload can't be read. */
export function attachmentSummary(type: string, payloadJson: string | null): { label: string; title: string; detail: string } | null {
  if (!payloadJson || type === "Text") return null;
  let p: Record<string, any>;
  try {
    p = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  switch (type) {
    case "WorkoutSession": {
      const exs: { name: string; sets: number }[] = Array.isArray(p.exercises) ? p.exercises : [];
      const mins = p.duration ? `${Math.round(p.duration / 60000)} min` : "";
      const count = exs.length ? `${exs.length} exercise${exs.length === 1 ? "" : "s"}` : "";
      return {
        label: "Workout",
        title: [mins, count].filter(Boolean).join(" · ") || "Workout",
        detail: exs.map((e) => `${e.name} (${e.sets})`).join(" · "),
      };
    }
    case "PersonalRecord":
      return p.exerciseName ? { label: "Personal record", title: p.exerciseName, detail: prText(p.weight, p.unit, p.reps) } : null;
    case "Split": {
      if (!p.name) return null;
      const days: { name?: string; blocks?: unknown[]; rest?: boolean }[] = Array.isArray(p.days) ? p.days : [];
      return {
        label: "Split",
        title: p.name,
        detail: days.filter((d) => !d.rest).map((d, i) => `${d.name || `Day ${i + 1}`}${d.blocks?.length ? ` (${d.blocks.length})` : ""}`).join(" · "),
      };
    }
    case "Exercise":
      if (!p.name) return null;
      return {
        label: p.kind === "cardio" ? "Cardio" : p.kind === "mobility" ? "Mobility" : "Exercise",
        title: p.name,
        detail: p.notes ?? (Array.isArray(p.primaryMuscles) ? p.primaryMuscles.join(", ") : ""),
      };
    case "Algorithm":
      return p.name ? { label: "Algorithm", title: p.name, detail: [p.family, p.description].filter(Boolean).join(" · ") } : null;
    case "Widget":
      return p.name ? { label: "Widget", title: p.name, detail: p.description ?? "" } : null;
    case "Habit":
      return p.name ? { label: "Habit", title: p.name, detail: cadenceText(p.cadence) } : null;
    default:
      return null;
  }
}

/** A shared split block's plan in a few characters: "4 × 8 @ 60 kg", "3 × 30 s", "Cardio". */
export function sharedBlockTarget(b: SharedBlock): string {
  if (b.type === "cardio") return "Cardio";
  if (b.type === "mobility") {
    const t = b.targets;
    const each = b.metric === "reps" ? (t?.reps ? `${t.reps}` : "") : t?.holdSec ? `${t.holdSec} s` : "";
    const sets = t?.sets ? `${t.sets} × ` : "";
    return (sets + each).trim() || "Mobility";
  }
  const t = b.targets;
  if (!t?.sets && !t?.reps && !t?.weight) return "";
  const sr = [t.sets, t.reps].filter((x) => x != null).join(" × ");
  return [sr, t.weight ? `@ ${t.weight} kg` : ""].filter(Boolean).join(" ");
}

/** Which attachments a reader can copy, and where to (phone-only ones say so). */
export function copyTarget(type: string): "split" | "library" | "habit" | "phone" | null {
  switch (type) {
    case "Split": return "split";
    case "Exercise": return "library";
    case "Habit": return "habit";
    case "Algorithm":
    case "Widget": return "phone";
    default: return null;
  }
}
