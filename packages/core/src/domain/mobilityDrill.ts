import type { MobilityMetric } from "./workout";

/**
 * Body areas a mobility drill targets. Deliberately its own vocabulary rather
 * than reusing `MuscleGroup` — mobility work is organised around joints and
 * regions (t-spine, ankles, hip flexors) that strength tracking never names.
 */
export type MobilityArea =
  | "neck"
  | "shoulders"
  | "t-spine"
  | "lower-back"
  | "wrists"
  | "hips"
  | "hip-flexors"
  | "glutes"
  | "hamstrings"
  | "quads"
  | "adductors"
  | "calves"
  | "ankles"
  | "full-body";

export const MOBILITY_AREAS: readonly MobilityArea[] = [
  "neck",
  "shoulders",
  "t-spine",
  "lower-back",
  "wrists",
  "hips",
  "hip-flexors",
  "glutes",
  "hamstrings",
  "quads",
  "adductors",
  "calves",
  "ankles",
  "full-body",
] as const;

export function isMobilityArea(v: unknown): v is MobilityArea {
  return typeof v === "string" && (MOBILITY_AREAS as readonly string[]).includes(v);
}

export type MobilityDrill = {
  id: string;
  name: string;
  area: MobilityArea;
  /** Whether the drill is measured by hold time or by reps by default. */
  defaultMetric: MobilityMetric;
  /** Whether the drill is unilateral and should be logged per side. */
  perSide: boolean;
  /** Short coaching cues shown under the drill name. */
  cues: string[];
  notes: string | null;
  /** True for the app's own seed list; false for community-pack drills. */
  isCore: boolean;
};

/** `pack:<pluginId>:<slug>` — mirrors `packExerciseId`. */
export function mobilityDrillSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The bundled starter catalog — a broad sweep of the drills people actually
 * progressively overload (loaded end-range work, long isometric holds, joint
 * prep). Doubles as the default autocomplete source for the Mobility block.
 */
export const BUILTIN_MOBILITY_DRILLS: MobilityDrill[] = [
  {
    id: "core:couch-stretch",
    name: "Couch stretch",
    area: "hip-flexors",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Rear shin flat against the wall", "Squeeze the glute", "Ribs down, don't arch"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:90-90",
    name: "90/90 hip switch",
    area: "hips",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Both sit bones stay down", "Move from the hips, not the torso"],
    notes: "Count one rep per switch toward the side being trained.",
    isCore: true,
  },
  {
    id: "core:cossack-squat",
    name: "Cossack squat",
    area: "adductors",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Straight leg toes up", "Sit into the bent hip", "Chest tall"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:hip-cars",
    name: "Hip CARs",
    area: "hips",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Slow, maximal circles", "Keep the rest of the body still"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:standing-hamstring",
    name: "Standing hamstring stretch",
    area: "hamstrings",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Hinge from the hip", "Flat back, soft knee"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:jefferson-curl",
    name: "Jefferson curl",
    area: "hamstrings",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Roll down one vertebra at a time", "Light load, full control"],
    notes: "Loaded end-range hamstring/spine work — progress load slowly.",
    isCore: true,
  },
  {
    id: "core:dead-hang",
    name: "Dead hang",
    area: "shoulders",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Full grip", "Shoulders active, not shrugged", "Breathe"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:deep-squat-hold",
    name: "Deep squat hold",
    area: "ankles",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Heels down", "Elbows push knees out", "Tall spine"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:thoracic-rotation",
    name: "Thoracic rotation",
    area: "t-spine",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Rotate from the mid-back", "Follow the hand with the eyes"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:wall-slides",
    name: "Wall slides",
    area: "shoulders",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Wrists and elbows stay on the wall", "Ribs down"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:ankle-rock",
    name: "Half-kneeling ankle rock",
    area: "ankles",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Knee tracks over the toes", "Heel glued down"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:pancake",
    name: "Pancake fold",
    area: "adductors",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Anterior pelvic tilt", "Walk the hands forward, chest long"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:pigeon",
    name: "Pigeon pose",
    area: "glutes",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Square the hips", "Front shin toward parallel over time"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:frog-stretch",
    name: "Frog stretch",
    area: "adductors",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Knees wide, shins parallel", "Rock back slowly"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:wrist-prep",
    name: "Wrist prep rocks",
    area: "wrists",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Palms down, fingers back", "Rock gently to tolerance"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:calf-stretch",
    name: "Straight-leg calf stretch",
    area: "calves",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Back heel down", "Hips square to the wall"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:seated-fig4",
    name: "Seated figure-4",
    area: "glutes",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Flex the top foot", "Hinge forward with a flat back"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:cat-cow",
    name: "Cat-cow",
    area: "lower-back",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Segment the spine", "Match the breath to the movement"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:neck-cars",
    name: "Neck CARs",
    area: "neck",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Small, controlled circles", "Stay out of pain"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:hip-flexor-raise",
    name: "Standing hip flexor raise",
    area: "hip-flexors",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Stand tall", "Lift the knee as high as control allows", "No torso lean"],
    notes: "Active end-range hip flexion — the rehab drill for leg raises around an object.",
    isCore: true,
  },
];

export function findBuiltinMobilityDrill(nameOrId: string): MobilityDrill | undefined {
  const q = nameOrId.toLowerCase().trim();
  return BUILTIN_MOBILITY_DRILLS.find(
    (d) => d.id === nameOrId || d.name.toLowerCase() === q,
  );
}
