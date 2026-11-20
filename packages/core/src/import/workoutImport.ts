import { parseCsv } from "./csv";
import type {
  CardioBlockData, MobilityBlockData, SessionBlock, SetEntry, SetType, StrengthBlockData, WorkoutSession,
} from "../domain/workout";

/**
 * Workout history from another app or a spreadsheet, as LogIt workouts (design canvas I1, E1b,
 * I2). A file is read into `ParsedImport` (nothing saved), checked by the person, then turned
 * into sessions with `toSessions`. Each workout's id comes from where it came from, so importing
 * the same file (or a newer export of the same app) never adds a workout twice.
 *
 * Formats: LogIt's own spreadsheet layout today. Strong and Hevy plug in as more readers once
 * real export files are in the tests (their published layouts disagree with each other).
 */
export type ImportSource = "spreadsheet";
export type WeightUnit = "kg" | "lb";

export type ImportedSet = {
  setType: SetType;
  weight?: number;
  /** Unset when the file doesn't say: the person picks one for the whole file. */
  unit?: WeightUnit;
  reps?: number;
  seconds?: number;
  distanceM?: number;
  rpe?: number;
  note?: string;
};
export type ImportedExercise = { name: string; sets: ImportedSet[] };
export type ImportedWorkout = { key: string; startedAtMs: number; endedAtMs?: number; title?: string; note?: string; exercises: ImportedExercise[] };
export type ParsedImport = {
  source: ImportSource;
  workouts: ImportedWorkout[];
  /** Some weights have no unit in the file: ask "kg or lb?" once. */
  unitUnknown: boolean;
  /** Rows that couldn't be read, with their line number in the file. At most 20. */
  problems: string[];
  /** Dates written 3/4/2026 were read day first (or month first, when a day over 12 says so). */
  slashDates?: "day-first" | "month-first";
};

const LB_PER_KG = 2.20462262185;

// Header names after lower-casing and turning brackets, underscores and dashes into spaces.
const COLUMNS: Record<string, string[]> = {
  date: ["date", "day"],
  time: ["time", "start time"],
  workout: ["workout", "workout name", "title", "session"],
  exercise: ["exercise", "exercise name", "exercise title", "lift"],
  setType: ["set type", "type"],
  weight: ["weight", "load"],
  weightKg: ["weight kg", "kg"],
  weightLb: ["weight lb", "weight lbs", "lb", "lbs"],
  unit: ["unit", "units"],
  reps: ["reps", "repetitions"],
  rpe: ["rpe"],
  seconds: ["seconds", "duration seconds", "time s", "secs"],
  distanceKm: ["distance km", "km"],
  distanceM: ["distance m", "metres", "meters"],
  durationMin: ["duration min", "minutes"],
  notes: ["notes", "note", "set notes"],
  workoutNotes: ["workout notes", "workout note", "session notes"],
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[()_\-[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const t = v.trim().replace(/\s/g, "");
  if (!t) return undefined;
  const n = Number(t.includes(".") ? t.replace(/,/g, "") : t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function setTypeOf(v: string | undefined): SetType {
  const t = (v ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (t === "w" || t === "warmup") return "warmup";
  if (t === "d" || t === "drop" || t === "dropset") return "dropset";
  if (t === "f" || t === "failure") return "failure";
  if (t === "amrap") return "amrap";
  return "normal";
}

type DateParts = { y: number; a: number; b: number; slash: boolean; h?: number; min?: number };

function dateParts(date: string, time?: string): DateParts | null {
  const d = date.trim();
  const t = (time ?? "").trim() || d.match(/[T ](\d{1,2}:\d{2})/)?.[1] || "";
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  const clock = hm ? { h: Number(hm[1]), min: Number(hm[2]) } : {};
  const iso = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { y: Number(iso[1]), a: Number(iso[2]), b: Number(iso[3]), slash: false, ...clock };
  const sl = d.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (sl) return { y: Number(sl[3]), a: Number(sl[1]), b: Number(sl[2]), slash: true, ...clock };
  return null;
}

/** Reads a workout CSV. Throws when it isn't one (no date or exercise column). */
export function readWorkoutCsv(text: string): ParsedImport {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(normaliseHeader);
  const col = (key: string) => header.findIndex((h) => COLUMNS[key]!.includes(h));
  const at = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k)])) as Record<string, number>;
  if (at.date! < 0 || at.exercise! < 0) {
    throw new Error("This file doesn't look like a workout log: it needs a date and an exercise column.");
  }
  const cell = (row: string[], key: string) => (at[key]! >= 0 ? row[at[key]!]?.trim() || undefined : undefined);

  // Slash dates: day first (Ireland, UK) unless a "day" over 12 shows they're month first.
  const parsedDates = rows.slice(1).map((r) => dateParts(cell(r, "date") ?? "", cell(r, "time")));
  const monthFirst = parsedDates.some((p) => p?.slash && p.b > 12);
  const anySlash = parsedDates.some((p) => p?.slash);

  const problems: string[] = [];
  const byKey = new Map<string, ImportedWorkout>();
  let unitUnknown = false;
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const p = parsedDates[i];
    const name = cell(row, "exercise");
    if (!p || !name) {
      if (problems.length < 20) problems.push(`Line ${line}: ${!p ? "no date LogIt can read" : "no exercise"}`);
      return;
    }
    const [month, day] = p.slash && !monthFirst ? [p.b, p.a] : [p.a, p.b];
    // No time: midday, so a time zone can't move it to another day.
    const startedAtMs = new Date(p.y, month - 1, day, p.h ?? 12, p.min ?? 0).getTime();
    if (!Number.isFinite(startedAtMs) || month < 1 || month > 12 || day < 1 || day > 31) {
      if (problems.length < 20) problems.push(`Line ${line}: no date LogIt can read`);
      return;
    }
    const title = cell(row, "workout");
    const key = `${new Date(startedAtMs).toISOString()}|${title ?? ""}`;

    const kg = num(cell(row, "weightKg"));
    const lb = num(cell(row, "weightLb"));
    const plain = num(cell(row, "weight"));
    const unitCell = cell(row, "unit")?.toLowerCase();
    const unit: WeightUnit | undefined = kg != null ? "kg" : lb != null ? "lb"
      : unitCell?.startsWith("kg") ? "kg" : unitCell?.startsWith("lb") ? "lb" : undefined;
    const weight = kg ?? lb ?? plain;
    if (weight != null && weight !== 0 && !unit) unitUnknown = true;

    const km = num(cell(row, "distanceKm"));
    const m = num(cell(row, "distanceM"));
    const set: ImportedSet = {
      setType: setTypeOf(cell(row, "setType")),
      ...(weight != null ? { weight } : {}),
      ...(unit ? { unit } : {}),
      ...(num(cell(row, "reps")) != null ? { reps: Math.round(num(cell(row, "reps"))!) } : {}),
      ...(num(cell(row, "seconds")) != null ? { seconds: num(cell(row, "seconds")) } : {}),
      ...(km != null ? { distanceM: km * 1000 } : m != null ? { distanceM: m } : {}),
      ...(num(cell(row, "rpe")) != null ? { rpe: num(cell(row, "rpe")) } : {}),
      ...(cell(row, "notes") ? { note: cell(row, "notes") } : {}),
    };
    if (set.reps == null && set.seconds == null && set.distanceM == null) {
      if (problems.length < 20) problems.push(`Line ${line}: no reps, seconds or distance`);
      return;
    }

    let w = byKey.get(key);
    if (!w) {
      const minutes = num(cell(row, "durationMin"));
      w = { key, startedAtMs, ...(title ? { title } : {}), exercises: [], ...(minutes ? { endedAtMs: startedAtMs + minutes * 60_000 } : {}) };
      byKey.set(key, w);
    }
    const note = cell(row, "workoutNotes");
    if (note && !w.note) w.note = note;
    // The same exercise again later in the workout is a separate block, as it was done.
    const last = w.exercises.at(-1);
    if (last && last.name === name) last.sets.push(set);
    else w.exercises.push({ name, sets: [set] });
  });

  return {
    source: "spreadsheet",
    workouts: [...byKey.values()].sort((a, b) => a.startedAtMs - b.startedAtMs),
    unitUnknown,
    problems,
    ...(anySlash ? { slashDates: monthFirst ? "month-first" : "day-first" } : {}),
  };
}

/** What the check screen shows (E1b). */
export function summariseImport(parsed: ParsedImport) {
  const sets = parsed.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
  const setsByExercise = new Map<string, number>();
  let noWeight = 0;
  let heaviest: { name: string; weight: number } | null = null;
  for (const w of parsed.workouts) {
    for (const e of w.exercises) {
      setsByExercise.set(e.name, (setsByExercise.get(e.name) ?? 0) + e.sets.length);
      for (const s of e.sets) {
        if (s.reps != null && !s.weight) noWeight++;
        if (s.weight && !s.unit && (!heaviest || s.weight > heaviest.weight)) heaviest = { name: e.name, weight: s.weight };
      }
    }
  }
  const last = parsed.workouts.at(-1);
  return {
    workouts: parsed.workouts.length,
    sets,
    firstAtMs: parsed.workouts[0]?.startedAtMs,
    lastAtMs: last?.startedAtMs,
    last: last ? { title: last.title, exercises: last.exercises.length } : null,
    /** Exercise names with their set counts, most sets first. */
    exercises: [...setsByExercise].map(([name, count]) => ({ name, sets: count })).sort((a, b) => b.sets - a.sets),
    setsWithoutWeight: noWeight,
    /** For "kg or lb?": the heaviest weight that has no unit. */
    heaviestUnitless: heaviest,
  };
}

/** How each exercise in the file becomes a block. */
export type BlockKind = "strength" | "hold" | "cardio";

export function blockKindOf(e: ImportedExercise): BlockKind {
  if (e.sets.some((s) => s.distanceM != null)) return "cardio";
  if (e.sets.every((s) => s.seconds != null && s.reps == null)) return "hold";
  return "strength";
}

/** A short stable hash (FNV-1a, 52 bits) for ids that come from where a workout came from. */
export function stableId(prefix: string, text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return `${prefix}_${h1.toString(36)}${(h2 & 0xfffff).toString(36)}`;
}

/**
 * The workouts as LogIt sessions. `exerciseFor` gives each exercise name its LogIt exercise (a
 * match, or the person's own one made for it); `unit` is for weights the file gave no unit.
 */
export function toSessions(
  parsed: ParsedImport,
  opts: { unit: WeightUnit; exerciseFor: (name: string) => { exerciseId?: string; name: string } },
): WorkoutSession[] {
  const kgOf = (s: ImportedSet) => {
    if (s.weight == null) return 0;
    const kg = (s.unit ?? opts.unit) === "lb" ? s.weight / LB_PER_KG : s.weight;
    return Math.round(kg * 100) / 100;
  };
  return parsed.workouts.map((w) => {
    const id = stableId("imp", `${parsed.source}|${w.key}`);
    const blocks: SessionBlock[] = w.exercises.map((e, bi) => {
      const blockId = `${id}_b${bi}`;
      const ex = opts.exerciseFor(e.name);
      const kind = blockKindOf(e);
      if (kind === "cardio") {
        const data: CardioBlockData = {
          activityName: ex.name,
          intervals: e.sets.map((s, si) => ({
            id: `${blockId}_s${si}`, orderIndex: si,
            durationMs: s.seconds != null ? s.seconds * 1000 : null, distanceM: s.distanceM ?? null, note: s.note ?? null,
          })),
        };
        return { id: blockId, type: "cardio", orderIndex: bi, data };
      }
      if (kind === "hold") {
        const data: MobilityBlockData = {
          drillName: ex.name, metric: "hold", perSide: false,
          sets: e.sets.map((s, si) => ({
            id: `${blockId}_s${si}`, orderIndex: si, durationSec: s.seconds, completed: true,
            ...(s.weight ? { loadKg: kgOf(s) } : {}), ...(s.note ? { note: s.note } : {}),
          })),
        };
        return { id: blockId, type: "mobility", orderIndex: bi, data };
      }
      const data: StrengthBlockData = {
        exerciseName: ex.name,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
        sets: e.sets.map((s, si): SetEntry => ({
          id: `${blockId}_s${si}`, orderIndex: si, setType: s.setType, reps: s.reps ?? 0, weight: kgOf(s), completed: true,
          ...(s.rpe != null ? { rpe: s.rpe } : {}), ...(s.note ? { note: s.note } : {}),
        })),
      };
      return { id: blockId, type: "strength", orderIndex: bi, data };
    });
    return {
      id,
      startedAtMs: w.startedAtMs,
      ...(w.endedAtMs ? { endedAtMs: w.endedAtMs } : {}),
      blocks,
      ...(w.title ? { name: w.title } : {}),
      ...(w.note ? { note: w.note } : {}),
    };
  });
}
