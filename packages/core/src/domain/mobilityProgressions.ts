import { BUILTIN_MOBILITY_DRILLS, mobilityDrillSlug, type MobilityArea, type MobilityDrill } from "./mobilityDrill";

/**
 * How each built-in drill moves on once its area has its weekly time (docs/mobility-progressions-draft.md,
 * reviewed by Martin 2026-11-20): load if it takes load, then harder cues on the same drill in
 * order, then harder drills (a tree: several, any number), else the person picks one. `steady`
 * drills (neck) never get a harder suggestion. Coaching judgements, meant to be edited.
 */
export type DrillProgression = {
  takesLoad: boolean;
  harderCues: string[];
  harder: string[];
  easier: string[];
  steady?: boolean;
};

const P = (takesLoad: boolean, harderCues: string[], harder: string[] = [], easier: string[] = [], steady = false): DrillProgression =>
  ({ takesLoad, harderCues, harder, easier, ...(steady ? { steady } : {}) });

export const DRILL_PROGRESSIONS: Record<string, DrillProgression> = {
  // Hip flexors
  "core:hip-flexor-lunge": P(false, ["Squeeze the back glute", "Reach the same-side arm up"], ["core:lizard", "core:couch-stretch"]),
  "core:lizard": P(false, ["Elbows down to the floor", "Back knee lifted"], ["core:couch-stretch", "core:pigeon", "core:frog-stretch"], ["core:hip-flexor-lunge"]),
  "core:couch-stretch": P(false, ["Knee closer to the wall", "Torso upright", "Hands off the floor"], [], ["core:lizard", "core:standing-quad"]),
  "core:hip-flexor-raise": P(true, ["Pause at the top"]),
  // Adductors
  "core:butterfly": P(false, ["Feet closer in", "Fold forward from the hips"], ["core:frog-stretch", "core:pancake"]),
  "core:frog-stretch": P(false, ["Knees wider", "Hips back towards the heels"], ["core:pancake"], ["core:butterfly", "core:lizard"]),
  "core:pancake": P(true, ["Legs wider", "Chest to the floor"], [], ["core:frog-stretch", "core:butterfly"]),
  "core:cossack-squat": P(true, ["Lower", "Heel down", "Pause at the bottom"]),
  // Hamstrings
  "core:elephant-walk": P(false, ["Straighter knees"], ["core:standing-hamstring"]),
  "core:standing-hamstring": P(false, ["Foot higher", "Toes pulled back"], ["core:seated-pike", "core:jefferson-curl"], ["core:elephant-walk"]),
  "core:seated-pike": P(true, ["Reach past the toes", "Flat back"], ["core:jefferson-curl"], ["core:standing-hamstring"]),
  "core:jefferson-curl": P(true, ["Stand on a box for more range"], [], ["core:seated-pike"]),
  // Glutes
  "core:seated-fig4": P(false, ["Lean forward"], ["core:pigeon"]),
  "core:pigeon": P(false, ["Front shin more parallel to the front", "Fold forward"], [], ["core:seated-fig4", "core:lizard"]),
  // Hips
  "core:hip-cars": P(true, ["Slower", "Bigger circles"]),
  "core:90-90": P(false, ["Hands off the floor"], ["core:shin-box"]),
  "core:shin-box": P(false, ["Without hands"], [], ["core:90-90"]),
  // Ankles and calves
  "core:ankle-rock": P(true, ["Foot further from the wall"], ["core:deep-squat-hold"]),
  "core:deep-squat-hold": P(true, ["Heels down, feet narrower"], [], ["core:ankle-rock"]),
  "core:tib-raise": P(true, ["Feet further from the wall"]),
  "core:calf-stretch": P(false, ["Back foot further back"], ["core:downward-dog"]),
  "core:downward-dog": P(false, ["Heels down", "One leg at a time"], [], ["core:calf-stretch"]),
  // Quads
  "core:standing-quad": P(false, ["Tuck the pelvis", "Knee behind the hip"], ["core:couch-stretch"]),
  // Lower back
  "core:cat-cow": P(false, ["Slower, one segment at a time"]),
  "core:childs-pose": P(false, ["Walk the hands further", "Side reach"]),
  "core:sphinx": P(false, ["Sphinx, then cobra with straighter arms"]),
  "core:scorpion": P(false, ["Foot further across"]),
  // T-spine
  "core:open-book": P(false, ["Knee pinned down", "Follow the hand with the eyes"], ["core:thread-needle", "core:bretzel"]),
  "core:thread-needle": P(false, ["Reach further through", "Hold the end"], ["core:bretzel"], ["core:open-book"]),
  "core:bretzel": P(false, ["Pull the top heel in", "Shoulders flat"], [], ["core:thread-needle", "core:open-book"]),
  "core:thoracic-rotation": P(false, ["Hips still", "Slower"]),
  // Shoulders
  "core:wall-slides": P(false, ["Low back and wrists stay on the wall"]),
  "core:shoulder-cars": P(false, ["Slower", "Bigger circles"]),
  "core:band-dislocates": P(false, ["Narrower grip"]),
  "core:doorway-pec": P(false, ["Arm higher", "Step through further"]),
  "core:sleeper": P(false, [], [], [], true),
  "core:dead-hang": P(true, ["Longer", "One arm at a time when ready"]),
  // Neck and wrists
  "core:chin-tucks": P(false, [], [], [], true),
  "core:neck-cars": P(false, [], [], [], true),
  "core:neck-side": P(false, [], [], [], true),
  "core:wrist-prep": P(false, ["More weight over the hands"]),
  "core:wrist-flexor": P(false, ["Fingers pointing back"]),
  // Full body
  "core:worlds-greatest": P(false, ["Elbow to the floor", "Longer hold at the end"]),
};

/** A drill in a workout (by id, or by name for blocks that only have one) in the catalog: the
 * built-ins, plus packs and your own drills when the caller has them. */
export function findDrill(drill: { id?: string; name: string }, catalog: MobilityDrill[] = BUILTIN_MOBILITY_DRILLS): MobilityDrill | null {
  const slug = mobilityDrillSlug(drill.name);
  return catalog.find((d) => d.id === drill.id) ?? catalog.find((d) => mobilityDrillSlug(d.name) === slug) ?? null;
}

export function drillArea(drill: { id?: string; name: string; area?: string }, catalog?: MobilityDrill[]): MobilityArea | null {
  return (drill.area as MobilityArea | undefined) ?? findDrill(drill, catalog)?.area ?? null;
}

/**
 * The drill's progression with its harder drills resolved, for the algorithm: the reviewed
 * built-in data, else what the drill itself declares (a pack's fields; your own drills declare
 * nothing, so they get "pick one" and learn their next step from what you pick).
 */
export function progressionFor(
  drill: { id?: string; name: string },
  catalog: MobilityDrill[] = BUILTIN_MOBILITY_DRILLS,
): { takesLoad: boolean; harderCues: string[]; harder: { id: string; name: string }[]; steady: boolean } | null {
  const found = findDrill(drill, catalog);
  if (!found) return null;
  const p: DrillProgression = DRILL_PROGRESSIONS[found.id] ?? {
    takesLoad: !!found.takesLoad, harderCues: found.harderCues ?? [], harder: found.harder ?? [], easier: found.easier ?? [],
  };
  const harder = p.harder.flatMap((ref) => {
    const d = findDrill({ id: ref, name: ref }, catalog);
    return d && d.id !== found.id ? [{ id: d.id, name: d.name }] : [];
  });
  return { takesLoad: p.takesLoad, harderCues: p.harderCues, harder, steady: !!p.steady };
}
