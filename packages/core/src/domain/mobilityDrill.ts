import type { MobilityMetric } from "./workout";
import type { LibraryMedia } from "./exercise";

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
  /** True for the app's own seed list; false for community-pack and your own drills. */
  isCore: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  media?: LibraryMedia[];
  /** How it moves on once its area has its weekly time (built-ins: domain/mobilityProgressions.ts;
   * packs declare these; your own drills learn their next step from what you pick). */
  takesLoad?: boolean;
  harderCues?: string[];
  /** Harder / easier drills, by id or name. */
  harder?: string[];
  easier?: string[];
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
  {
    id: "core:hip-flexor-lunge",
    name: "Hip flexor lunge stretch",
    area: "hip-flexors",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Back knee down, tuck the pelvis under", "Squeeze the back glute", "Shift forward only a little"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:lizard",
    name: "Lizard pose",
    area: "hip-flexors",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Front foot outside the hand", "Let the hips sink", "Elbows down if you can"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:worlds-greatest",
    name: "World's greatest stretch",
    area: "full-body",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Lunge, hand inside the front foot", "Rotate the top arm to the ceiling", "Straighten the front leg to finish"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:downward-dog",
    name: "Downward dog",
    area: "calves",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Push the floor away", "Long spine first, straight legs second", "Pedal the heels"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:shin-box",
    name: "Shin box get-up",
    area: "hips",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Both knees bent at 90°", "Drive the front hip forward to come up to the knees", "Control the way down"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:butterfly",
    name: "Butterfly stretch",
    area: "adductors",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Soles of the feet together", "Sit tall, hinge forward from the hips", "Don't push the knees down with force"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:seated-pike",
    name: "Seated pike stretch",
    area: "hamstrings",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Legs straight, toes up", "Fold from the hips, flat back", "Reach long, not down"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:elephant-walk",
    name: "Elephant walk",
    area: "hamstrings",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Hands on the floor, hips high", "Bend one knee while straightening the other", "Count each side as one rep"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:standing-quad",
    name: "Standing quad stretch",
    area: "quads",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Knees together", "Tuck the pelvis under", "Hold a wall for balance"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:tib-raise",
    name: "Tibialis raise",
    area: "ankles",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Back against a wall, heels forward", "Lift the toes as high as you can", "Slow lowering"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:childs-pose",
    name: "Child's pose",
    area: "lower-back",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Knees wide, big toes together", "Reach the arms long", "Breathe into the back"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:sphinx",
    name: "Sphinx / cobra",
    area: "lower-back",
    defaultMetric: "hold",
    perSide: false,
    cues: ["Forearms on the floor under the shoulders", "Hips stay down", "Press up to straight arms for cobra"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:scorpion",
    name: "Scorpion stretch",
    area: "lower-back",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Lying face down, arms out", "Reach one foot across to the opposite hand", "Chest stays on the floor"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:open-book",
    name: "Open book",
    area: "t-spine",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Side-lying, knees bent and stacked", "Open the top arm over to the other side", "Follow the hand with the eyes"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:thread-needle",
    name: "Thread the needle",
    area: "t-spine",
    defaultMetric: "reps",
    perSide: true,
    cues: ["On hands and knees", "Slide one arm under the body, then reach it to the ceiling", "Hips stay over the knees"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:bretzel",
    name: "Bretzel stretch",
    area: "t-spine",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Side-lying, hold the bottom foot behind you", "Top knee pinned down", "Rotate the chest open and breathe"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:doorway-pec",
    name: "Doorway pec stretch",
    area: "shoulders",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Forearm on the door frame, elbow at shoulder height", "Step through gently", "No pain in the front of the shoulder"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:sleeper",
    name: "Sleeper stretch",
    area: "shoulders",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Lie on the side, arm in front at shoulder height", "Gently press the forearm down", "Stop at a mild stretch"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:shoulder-cars",
    name: "Shoulder CARs",
    area: "shoulders",
    defaultMetric: "reps",
    perSide: true,
    cues: ["Biggest slow circle you can make", "Rest of the body stays still", "Both directions"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:band-dislocates",
    name: "Band pass-throughs",
    area: "shoulders",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Wide grip on a band or stick", "Arms straight over and behind", "Narrow the grip over time"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:chin-tucks",
    name: "Chin tucks",
    area: "neck",
    defaultMetric: "reps",
    perSide: false,
    cues: ["Slide the chin straight back", "Don't nod down", "Hold two seconds"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:neck-side",
    name: "Neck side stretch",
    area: "neck",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Ear toward the shoulder", "Opposite shoulder stays down", "Gentle, no pulling"],
    notes: null,
    isCore: true,
  },
  {
    id: "core:wrist-flexor",
    name: "Wrist flexor stretch",
    area: "wrists",
    defaultMetric: "hold",
    perSide: true,
    cues: ["Arm straight, palm up", "Pull the fingers back gently with the other hand"],
    notes: null,
    isCore: true,
  },
];

export function findBuiltinMobilityDrill(nameOrId: string): MobilityDrill | undefined {
  const q = nameOrId.toLowerCase().trim();
  return BUILTIN_MOBILITY_DRILLS.find(
    (d) => d.id === nameOrId || d.name.toLowerCase() === q,
  );
}
