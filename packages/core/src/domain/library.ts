import type { Equipment, Exercise, MuscleGroup } from "./exercise";
import { CORE_EXERCISES } from "./coreExercises";
import { BUILTIN_CARDIO, type CardioActivity, type CardioMeasure } from "./cardioActivity";
import { BUILTIN_MOBILITY_DRILLS, type MobilityArea, type MobilityDrill } from "./mobilityDrill";
import type { MobilityMetric } from "./workout";
import { createId } from "./ids";
import { nowMs } from "./time";

/**
 * One library for everything you can add to a workout: strength exercises, cardio
 * activities and mobility drills. Each account sees LogIt's bank, its own items, items its
 * coach shares, and (on the phone) installed plugin packs.
 *
 * Storage: your own strength exercises are the existing `Exercise` records. Your own
 * cardio and mobility items are stored and synced as the same kind of record with a
 * `kind` field (sync rows for strength have none, so old data needs no change).
 */

export type LibraryKind = "strength" | "cardio" | "mobility";
export const LIBRARY_KINDS: readonly LibraryKind[] = ["strength", "cardio", "mobility"] as const;

/** Where an item comes from. Only "mine" is editable. */
export type LibrarySource = "mine" | "coach" | "logit" | "pack";

export type CoachRef = { coachId: string; coachName: string };

export type LibraryEntry =
  | { kind: "strength"; source: LibrarySource; coach?: CoachRef; item: Exercise }
  | { kind: "cardio"; source: LibrarySource; coach?: CoachRef; item: CardioActivity }
  | { kind: "mobility"; source: LibrarySource; coach?: CoachRef; item: MobilityDrill };

/** An item of any kind with its kind, as stored or synced. */
export type LibraryItem =
  | { kind: "strength"; item: Exercise }
  | { kind: "cardio"; item: CardioActivity }
  | { kind: "mobility"; item: MobilityDrill };

// ── Labels ────────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<LibraryKind, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  core: "core",
  forearms: "forearms",
};

export const MOBILITY_AREA_LABEL: Record<MobilityArea, string> = {
  neck: "neck",
  shoulders: "shoulders",
  "t-spine": "t-spine",
  "lower-back": "lower back",
  wrists: "wrists",
  hips: "hips",
  "hip-flexors": "hip flexors",
  glutes: "glutes",
  hamstrings: "hamstrings",
  quads: "quads",
  adductors: "adductors",
  calves: "calves",
  ankles: "ankles",
  "full-body": "full body",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  cable: "cable",
  machine: "machine",
  smith: "Smith machine",
  bodyweight: "bodyweight",
  band: "band",
  other: "other",
};

export const CARDIO_MEASURE_LABEL: Record<CardioMeasure, string> = {
  time: "time",
  "time-distance": "time · distance",
};

/** "From Alex", "LogIt", "Mine"… for a section header or badge. */
export function sourceLabel(entry: Pick<LibraryEntry, "source" | "coach">): string {
  switch (entry.source) {
    case "mine": return "Mine";
    case "coach": return entry.coach ? `From ${entry.coach.coachName}` : "From your coach";
    case "logit": return "LogIt";
    case "pack": return "Pack";
  }
}

/** The grey line under an item's name: "quads, glutes · barbell", "hips · hold · each side". */
export function entryDetails(entry: LibraryItem): string {
  switch (entry.kind) {
    case "strength": {
      const e = entry.item;
      const muscles = (e.primaryMuscles.length ? e.primaryMuscles : e.secondaryMuscles).map((m) => MUSCLE_LABEL[m]);
      const parts = [muscles.join(", ")];
      if (e.equipment) parts.push(EQUIPMENT_LABEL[e.equipment]);
      return parts.filter(Boolean).join(" · ") || "no muscles set";
    }
    case "mobility": {
      const d = entry.item;
      return [MOBILITY_AREA_LABEL[d.area] ?? d.area, d.defaultMetric, d.perSide ? "each side" : ""].filter(Boolean).join(" · ");
    }
    case "cardio":
      return CARDIO_MEASURE_LABEL[entry.item.measures];
  }
}

// ── Sync records ──────────────────────────────────────────────────────────────

/**
 * The JSON stored in a sync row. Strength stays a bare `Exercise` (what every app version
 * has always written); cardio and mobility carry `kind`.
 */
export function libraryItemToJson(entry: LibraryItem): string {
  if (entry.kind === "strength") return JSON.stringify(entry.item);
  return JSON.stringify({ kind: entry.kind, ...entry.item });
}

/** Reads a sync row's JSON. `kindHint` is the row's own kind column when there is one. */
export function libraryItemFromJson(dataJson: string, kindHint?: string | null): LibraryItem | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(dataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const kind = (typeof raw.kind === "string" ? raw.kind : kindHint) ?? "strength";
  const { kind: _drop, ...rest } = raw;
  if (kind === "cardio") return { kind, item: normaliseCardio(rest) };
  if (kind === "mobility") return { kind, item: normaliseMobility(rest) };
  if (kind === "strength") return { kind, item: normaliseExercise(rest) };
  return null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function normaliseExercise(r: Record<string, unknown>): Exercise {
  const e = r as unknown as Exercise;
  return {
    ...e,
    notes: e.notes ?? null,
    isCore: false,
    createdAtMs: typeof e.createdAtMs === "number" ? e.createdAtMs : 0,
    primaryMuscles: (strings(e.primaryMuscles) as MuscleGroup[]),
    secondaryMuscles: (strings(e.secondaryMuscles) as MuscleGroup[]),
  };
}

function normaliseCardio(r: Record<string, unknown>): CardioActivity {
  return {
    id: String(r.id),
    name: String(r.name),
    measures: r.measures === "time" ? "time" : "time-distance",
    cues: strings(r.cues),
    notes: typeof r.notes === "string" ? r.notes : null,
    isCore: false,
    ...(typeof r.createdAtMs === "number" ? { createdAtMs: r.createdAtMs } : {}),
    ...(typeof r.updatedAtMs === "number" ? { updatedAtMs: r.updatedAtMs } : {}),
  };
}

function normaliseMobility(r: Record<string, unknown>): MobilityDrill {
  return {
    id: String(r.id),
    name: String(r.name),
    area: (typeof r.area === "string" ? r.area : "full-body") as MobilityArea,
    defaultMetric: r.defaultMetric === "reps" ? "reps" : "hold",
    perSide: r.perSide === true,
    cues: strings(r.cues),
    notes: typeof r.notes === "string" ? r.notes : null,
    isCore: false,
    ...(typeof r.createdAtMs === "number" ? { createdAtMs: r.createdAtMs } : {}),
    ...(typeof r.updatedAtMs === "number" ? { updatedAtMs: r.updatedAtMs } : {}),
  };
}

// ── New items ─────────────────────────────────────────────────────────────────

export function newCardioActivity(input: { name: string; measures?: CardioMeasure; cues?: string[]; notes?: string | null }): CardioActivity {
  const now = nowMs();
  return {
    id: createId("cardio"),
    name: input.name.trim(),
    measures: input.measures ?? "time-distance",
    cues: cleanCues(input.cues),
    notes: input.notes?.trim() || null,
    isCore: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function newMobilityDrill(input: {
  name: string;
  area?: MobilityArea;
  defaultMetric?: MobilityMetric;
  perSide?: boolean;
  cues?: string[];
  notes?: string | null;
}): MobilityDrill {
  const now = nowMs();
  return {
    id: createId("drill"),
    name: input.name.trim(),
    area: input.area ?? "full-body",
    defaultMetric: input.defaultMetric ?? "hold",
    perSide: input.perSide ?? false,
    cues: cleanCues(input.cues),
    notes: input.notes?.trim() || null,
    isCore: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/** Trims cues and drops empty ones. */
export function cleanCues(cues: string[] | undefined): string[] {
  return (cues ?? []).map((c) => c.trim()).filter(Boolean);
}

/** "Make my own copy" of a LogIt, coach or pack item: a new id, yours to edit. */
export function copyLibraryItem(entry: LibraryItem, name?: string): LibraryItem {
  const now = nowMs();
  const newName = (name ?? entry.item.name).trim();
  switch (entry.kind) {
    case "strength": {
      const { machines: _m, defaultMachineId: _d, ...rest } = entry.item;
      return { kind: "strength", item: { ...rest, id: createId("exdb"), name: newName, isCore: false, createdAtMs: now } };
    }
    case "cardio":
      return { kind: "cardio", item: { ...entry.item, id: createId("cardio"), name: newName, isCore: false, createdAtMs: now, updatedAtMs: now } };
    case "mobility":
      return { kind: "mobility", item: { ...entry.item, id: createId("drill"), name: newName, isCore: false, createdAtMs: now, updatedAtMs: now } };
  }
}

// ── Building the list ─────────────────────────────────────────────────────────

const SOURCE_RANK: Record<LibrarySource, number> = { mine: 0, coach: 1, logit: 2, pack: 3 };

/** LogIt's bank as entries. */
export function logitEntries(kind?: LibraryKind): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  if (!kind || kind === "strength") for (const item of CORE_EXERCISES) out.push({ kind: "strength", source: "logit", item });
  if (!kind || kind === "cardio") for (const item of BUILTIN_CARDIO) out.push({ kind: "cardio", source: "logit", item });
  if (!kind || kind === "mobility") for (const item of BUILTIN_MOBILITY_DRILLS) out.push({ kind: "mobility", source: "logit", item });
  return out;
}

const nameKey = (kind: LibraryKind, name: string) => `${kind}:${name.trim().toLowerCase()}`;

/**
 * Everything in one list, one entry per name within a kind: your own beats your coach's,
 * which beats LogIt's, which beats a pack's. (A coach who writes their own "Landmine
 * press" with their cues wants clients to see that one, not ours.) Sorted by name.
 */
export function mergeLibrary(groups: LibraryEntry[][]): LibraryEntry[] {
  const best = new Map<string, LibraryEntry>();
  for (const group of groups) {
    for (const e of group) {
      if (!e.item.name?.trim()) continue;
      const k = nameKey(e.kind, e.item.name);
      const have = best.get(k);
      if (!have || SOURCE_RANK[e.source] < SOURCE_RANK[have.source]) best.set(k, e);
    }
  }
  return [...best.values()].sort((a, b) => a.item.name.localeCompare(b.item.name));
}

export type LibraryFilter = {
  kind?: LibraryKind;
  query?: string;
  /** "coach:<id>" narrows to one coach. */
  source?: "all" | LibrarySource | `coach:${string}`;
};

export function filterLibrary(entries: LibraryEntry[], f: LibraryFilter): LibraryEntry[] {
  const q = f.query?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.source && f.source !== "all") {
      if (f.source.startsWith("coach:")) {
        if (e.source !== "coach" || `coach:${e.coach?.coachId}` !== f.source) return false;
      } else if (e.source !== f.source) return false;
    }
    if (q) {
      const hay = `${e.item.name} ${entryDetails(e)}`.toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export type LibrarySection = { key: string; label: string; entries: LibraryEntry[] };

/** Groups a list into Mine, From <each coach>, LogIt, Packs (empty sections dropped). */
export function librarySections(entries: LibraryEntry[]): LibrarySection[] {
  const sections = new Map<string, LibrarySection>();
  const order = (e: LibraryEntry) => (e.source === "coach" ? `coach:${e.coach?.coachId ?? ""}` : e.source);
  for (const e of entries) {
    const key = order(e);
    let s = sections.get(key);
    if (!s) {
      s = { key, label: sourceLabel(e), entries: [] };
      sections.set(key, s);
    }
    s.entries.push(e);
  }
  const rank = (key: string) => SOURCE_RANK[(key.startsWith("coach:") ? "coach" : key) as LibrarySource];
  return [...sections.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

/** Finds an entry by id, then by name, within a kind. */
export function findEntry(entries: LibraryEntry[], kind: LibraryKind, idOrName: { id?: string; name?: string }): LibraryEntry | undefined {
  if (idOrName.id) {
    const byId = entries.find((e) => e.kind === kind && e.item.id === idOrName.id);
    if (byId) return byId;
  }
  const n = idOrName.name?.trim().toLowerCase();
  return n ? entries.find((e) => e.kind === kind && e.item.name.toLowerCase() === n) : undefined;
}

/** Names a new item can't take because something of the same kind already has it. */
export function nameTaken(entries: LibraryEntry[], kind: LibraryKind, name: string, exceptId?: string): LibraryEntry | undefined {
  const n = name.trim().toLowerCase();
  return entries.find((e) => e.kind === kind && e.item.id !== exceptId && e.item.name.toLowerCase() === n);
}
