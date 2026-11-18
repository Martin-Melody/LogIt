// Places you train (My gym, design canvas G1–G10, X6–X7): a commercial gym, home, a work gym.
// A place holds what's there: the bar and plates, dumbbells, kettlebells, other kit, and its
// machines. A machine belongs to a place and serves every exercise done on it (a cable station
// is set up once, not once per exercise). Places are optional: with none, a workout simply
// has no machines and weights are typed. Machines are kept nowhere else (Martin, 2026-11-18):
// the first machine someone adds makes "My gym".
//
// Decisions (Martin, 2026-11-18): one history per exercise across places, the next machine
// weight taken from the last time on that same machine; a usual place per training day plus a
// skippable "Where are you today?"; at a place's heaviest weight, first ask whether load can be
// added another way (add-ons, a pin with plates, a vest or belt, bands or chains), else suggest
// a harder variation.

import type { Exercise, Machine, MachineWeights } from "./exercise";
import type { BarbellConfig } from "./plates";
import { DEFAULT_BARBELL } from "./plates";
import { createId } from "./ids";

export type PlaceKind = "gym" | "home" | "other";

/** How the weight goes on a machine (X6). */
export type MachineLoading = "stack" | "plates" | "assisted" | "none";

/** In, out of order for now, not here yet, or gone for good. */
export type MachineStatus = "in" | "out" | "coming" | "removed";

/** Ways to add load past a place's heaviest setting (asked once per piece of equipment). */
export type ExtraLoad = "addons" | "pin" | "vest" | "bands";

export type PlaceMachine = Machine & {
  loading: MachineLoading;
  status: MachineStatus;
  /** Exercises done on this machine at this place. */
  exerciseIds: string[];
  /** Answer to "Can you add load?" at the top of its settings. Empty = asked, said no. */
  extraLoad?: ExtraLoad[];
  /** Plate-loaded machines: the empty sled/carriage weight, kg. */
  emptyKg?: number;
  /** Clip-on/magnetic add-ons, in the machine's own unit; usable on any setting (X2). */
  addOns?: number[];
};

/** The machine as progression and the weight picker see it: its settings plus any add-ons. */
export function effectiveMachine(m: PlaceMachine): Machine {
  if (!m.addOns?.length || m.weights?.kind !== "stack") return m;
  const all = new Set(m.weights.values);
  for (const v of m.weights.values) for (const a of m.addOns) all.add(round2(v + a));
  return { ...m, weights: { kind: "stack", values: [...all].sort((a, b) => a - b) } };
}

export type Dumbbells =
  | { kind: "pairs"; kg: number[] }
  | { kind: "adjustable"; minKg: number; stepKg: number; maxKg: number };

/** Free equipment that isn't a machine, by a stable key (labels live in the apps). */
export const KIT = [
  "squat-rack", "flat-bench", "incline-bench", "pull-up-bar", "dip-bars", "bands", "cable-pulley",
  "trap-bar", "ez-bar", "rings", "box",
] as const;
export type Kit = (typeof KIT)[number];

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Bar and plates here; absent = no barbell. */
  barbell?: BarbellConfig;
  dumbbells?: Dumbbells;
  kettlebellsKg?: number[];
  kit: Kit[];
  machines: PlaceMachine[];
  /** Weekdays (1 = Monday … 7 = Sunday) usually trained here; picks the default place. */
  usualDays?: number[];
  /** Which machine each exercise is done on here, when it has several (exerciseId → machineId). */
  choices?: Record<string, string>;
  /** Per piece of free equipment ("dumbbells", "kettlebells", "barbell"): how load can be added. */
  extraLoad?: Partial<Record<"dumbbells" | "kettlebells" | "barbell" | "bodyweight", ExtraLoad[]>>;
  archivedAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

// ── Weight stacks in runs ────────────────────────────────────────────────────

/** One run of a stack: from `fromValue` (or the end of the previous run) up by `step` to `to`. */
export type StackRun = { step: number; to: number };

/**
 * A stack read off the machine in runs (X7): starts at `start`, goes up by run[0].step up to
 * run[0].to, then by run[1].step up to run[1].to, and so on. Many stacks go 5 kg at a time for
 * the first plates and 10 kg after that. Returns the exact settings, ascending, in the
 * machine's own units; stored as MachineWeights kind "stack".
 */
export function stackFromRuns(start: number, runs: StackRun[], cap = 200): number[] {
  const out: number[] = [];
  if (!(start >= 0)) return out;
  let v = round2(start);
  out.push(v);
  for (const r of runs) {
    if (!(r.step > 0) || !(r.to > v)) continue;
    while (v + r.step <= r.to + 1e-9 && out.length < cap) {
      v = round2(v + r.step);
      out.push(v);
    }
  }
  return out;
}

/** The runs a list of settings is made of (to show an existing stack back in X7's fields). */
export function runsFromStack(values: number[]): { start: number; runs: StackRun[] } | null {
  const v = [...new Set(values)].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const runs: StackRun[] = [];
  for (let i = 1; i < v.length; i++) {
    const step = round2(v[i]! - v[i - 1]!);
    const last = runs.at(-1);
    if (last && Math.abs(last.step - step) < 1e-9) last.to = v[i]!;
    else runs.push({ step, to: v[i]! });
  }
  return { start: v[0]!, runs };
}

export function stackWeights(start: number, runs: StackRun[], addOns?: number[]): MachineWeights {
  const values = stackFromRuns(start, runs);
  if (addOns?.length) {
    const all = new Set(values);
    for (const v of values) for (const a of addOns) all.add(round2(v + a));
    return { kind: "stack", values: [...all].sort((a, b) => a - b) };
  }
  return { kind: "stack", values };
}

// ── Dumbbells ────────────────────────────────────────────────────────────────

/** Every dumbbell weight available here, kg, ascending. */
export function dumbbellWeightsKg(d: Dumbbells | undefined): number[] {
  if (!d) return [];
  if (d.kind === "pairs") return [...new Set(d.kg.filter((w) => w > 0))].sort((a, b) => a - b);
  const out: number[] = [];
  if (!(d.stepKg > 0) || d.maxKg < d.minKg) return out;
  for (let w = d.minKg; w <= d.maxKg + 1e-9 && out.length < 200; w += d.stepKg) out.push(round2(w));
  return out;
}

// ── Templates (G10) ──────────────────────────────────────────────────────────

export type PlaceTemplate = "bodyweight" | "dumbbells" | "home-rack" | "gym";

export function newPlace(name: string, kind: PlaceKind, template: PlaceTemplate, now = Date.now()): Place {
  const base: Place = { id: createId("place"), name, kind, kit: [], machines: [], createdAtMs: now, updatedAtMs: now };
  switch (template) {
    case "bodyweight":
      return { ...base, kit: ["pull-up-bar"] };
    case "dumbbells":
      return { ...base, dumbbells: { kind: "adjustable", minKg: 2.5, stepKg: 2.5, maxKg: 24 }, kit: ["flat-bench"] };
    case "home-rack":
      return {
        ...base,
        barbell: { barKg: 20, platesKg: [20, 15, 10, 5, 2.5, 1.25] },
        dumbbells: { kind: "adjustable", minKg: 2.5, stepKg: 2.5, maxKg: 24 },
        kit: ["squat-rack", "flat-bench", "pull-up-bar"],
      };
    case "gym":
      return {
        ...base,
        barbell: { ...DEFAULT_BARBELL, platesKg: [...DEFAULT_BARBELL.platesKg] },
        dumbbells: { kind: "pairs", kg: Array.from({ length: 24 }, (_, i) => (i + 1) * 2.5) },
        kit: ["squat-rack", "flat-bench", "incline-bench", "pull-up-bar", "dip-bars", "cable-pulley"],
      };
  }
}

// ── Moving today's machines in ───────────────────────────────────────────────

/**
 * The first time places open: every machine kept on an exercise moves into one place called
 * "My gym", each serving its exercise, nothing lost. Machines with the same name and the same
 * settings on different exercises become one machine serving both.
 */
export function placeFromExerciseMachines(
  exercises: Pick<Exercise, "id" | "machines" | "defaultMachineId">[],
  now = Date.now(),
): Place | null {
  return mergeExerciseMachines([], exercises, now);
}

/**
 * Machines live only in places (Martin, 2026-11-18). Machines still kept on exercises that no
 * place has yet move into the first place in use, or into a new "My gym" when there is none.
 * Ids are kept, so each machine's history still lines up, and an exercise's usual machine
 * becomes its pick at that place. Returns the place to save, or null when nothing moved.
 */
export function mergeExerciseMachines(
  places: Place[],
  exercises: Pick<Exercise, "id" | "machines" | "defaultMachineId">[],
  now = Date.now(),
): Place | null {
  const known = new Set(places.flatMap((p) => p.machines.map((m) => m.id)));
  const target = activePlaces(places)[0] ?? newPlace("My gym", "gym", "gym", now);
  const machines = target.machines.map((m) => ({ ...m, exerciseIds: [...m.exerciseIds] }));
  const choices = { ...(target.choices ?? {}) };
  const movedTo = new Map<string, string>();
  for (const ex of exercises) {
    for (const m of ex.machines ?? []) {
      if (known.has(m.id)) continue;
      let into = machines.find((p) => p.id === m.id) ?? machines.find((p) => sameMachine(p, m));
      if (!into) {
        into = { ...m, loading: "stack", status: "in", exerciseIds: [] };
        machines.push(into);
      }
      if (!into.exerciseIds.includes(ex.id)) into.exerciseIds.push(ex.id);
      movedTo.set(m.id, into.id);
    }
    const usual = ex.defaultMachineId ? movedTo.get(ex.defaultMachineId) : undefined;
    if (usual && !choices[ex.id]) choices[ex.id] = usual;
  }
  if (movedTo.size === 0) return null;
  return { ...target, machines, choices, updatedAtMs: now };
}

function sameMachine(a: Machine, b: Machine): boolean {
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
    && (a.unit ?? "kg") === (b.unit ?? "kg")
    && a.incrementKg === b.incrementKg
    && JSON.stringify(a.weights ?? null) === JSON.stringify(b.weights ?? null);
}

// ── Which place, and which machine there ─────────────────────────────────────

/** Places in use (not archived), in the order made. */
export function activePlaces(places: Place[]): Place[] {
  return places.filter((p) => !p.archivedAtMs).sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/**
 * The place a workout starts at, before anyone is asked: the one whose usual days include
 * today, else the last one used, else the first made. Null with no places.
 */
export function defaultPlaceFor(places: Place[], weekday: number, lastUsedId: string | null): Place | null {
  const live = activePlaces(places);
  if (live.length === 0) return null;
  const usual = live.find((p) => p.usualDays?.includes(weekday));
  if (usual) return usual;
  return live.find((p) => p.id === lastUsedId) ?? live[0]!;
}

/** The machine an exercise is done on here: the one picked last time, else the first that's in. */
export function chosenMachine(place: Place | null | undefined, exerciseId: string): PlaceMachine | null {
  const options = machinesFor(place, exerciseId);
  if (options.length === 0) return null;
  const picked = place?.choices?.[exerciseId];
  return options.find((m) => m.id === picked && m.status === "in") ?? options.find((m) => m.status === "in") ?? options[0]!;
}

/** Machines at this place that an exercise can be done on (in, or out only for today). */
export function machinesFor(place: Place | null | undefined, exerciseId: string): PlaceMachine[] {
  if (!place) return [];
  return place.machines.filter((m) => m.exerciseIds.includes(exerciseId) && m.status !== "removed" && m.status !== "coming");
}

// ── The heaviest weight here ─────────────────────────────────────────────────

/** The heaviest a machine can be set to, kg; null if it has no known settings. */
export function heaviestKg(weightsKg: number[] | null): number | null {
  return weightsKg && weightsKg.length ? weightsKg[weightsKg.length - 1]! : null;
}

/**
 * What progression does when the plan asks for more than the place has: keep going with
 * extra load the person said they can add, ask them (once) if they haven't been asked, or
 * suggest a harder variation if they said no.
 */
export function atTheTop(extraLoad: ExtraLoad[] | undefined): "add-load" | "ask" | "harder" {
  if (extraLoad === undefined) return "ask";
  return extraLoad.length > 0 ? "add-load" : "harder";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
