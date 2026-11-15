import type { LibraryMedia } from "./exercise";

/**
 * What a cardio activity is logged with. Every cardio interval can hold a time and a
 * distance; this only says whether distance is worth asking for (no one measures a jump
 * rope session in metres).
 */
export type CardioMeasure = "time" | "time-distance";

export type CardioActivity = {
  id: string;
  name: string;
  measures: CardioMeasure;
  cues: string[];
  notes: string | null;
  /** True for LogIt's own list. */
  isCore: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  media?: LibraryMedia[];
};

function act(id: string, name: string, measures: CardioMeasure, cues: string[], notes: string | null = null): CardioActivity {
  return { id, name, measures, cues, notes, isCore: true };
}

/** LogIt's cardio list. Ids are permanent (`cardio:<slug>`). */
export const BUILTIN_CARDIO: CardioActivity[] = [
  act("cardio:running", "Running", "time-distance",
    ["Easy runs at a pace you could talk at", "Short, quick steps, land under the hips"]),
  act("cardio:treadmill-run", "Treadmill run", "time-distance",
    ["1% incline is closer to running outside", "Don't hold the rails"]),
  act("cardio:incline-walk", "Incline walk", "time-distance",
    ["Don't hold the rails", "Upright, short steps", "Note the incline and speed in the interval note"]),
  act("cardio:walking", "Walking", "time-distance",
    ["Brisk enough to raise your breathing a little"]),
  act("cardio:hiking", "Hiking", "time-distance", []),
  act("cardio:rucking", "Rucking", "time-distance",
    ["Pack high and tight on the back", "Note the pack weight"]),
  act("cardio:cycling", "Cycling", "time-distance", []),
  act("cardio:stationary-bike", "Stationary bike", "time-distance",
    ["Saddle height: slight bend in the knee at the bottom", "Note the resistance level"]),
  act("cardio:assault-bike", "Assault bike", "time-distance",
    ["Push and pull with the arms as well as the legs", "Great for short hard intervals"]),
  act("cardio:spin-class", "Spin class", "time", []),
  act("cardio:rowing-machine", "Rowing machine", "time-distance",
    ["Legs, then body, then arms", "Arms, body, legs on the way back", "Damper around 3–5"]),
  act("cardio:ski-erg", "Ski erg", "time-distance",
    ["Hinge and crunch down, arms follow", "Finish with the hands past the hips"]),
  act("cardio:elliptical", "Elliptical", "time-distance",
    ["Stand tall", "Push and pull the handles too"]),
  act("cardio:stair-climber", "Stair climber", "time",
    ["Light touch on the rails or none", "Whole foot on each step"]),
  act("cardio:swimming", "Swimming", "time-distance", []),
  act("cardio:jump-rope", "Jump rope", "time",
    ["Small jumps on the balls of the feet", "Turn the rope with the wrists"]),
  act("cardio:sled-push", "Sled push", "time-distance",
    ["Arms locked or bent, low body angle", "Drive with the legs, short powerful steps", "Note the load"]),
  act("cardio:battle-ropes", "Battle ropes", "time",
    ["Athletic stance, slight squat", "Keep the waves going to the anchor"]),
  act("cardio:boxing", "Boxing / bag work", "time",
    ["Hands up between combinations", "Turn the hips into each punch"]),
  act("cardio:grappling", "Grappling (BJJ, wrestling)", "time",
    ["Log rounds as intervals", "Use the note for drilling vs sparring"]),
  act("cardio:hiit-circuit", "HIIT circuit", "time",
    ["Log each work bout as an interval"]),
  act("cardio:team-sport", "Team sport", "time",
    ["Football, hurling, basketball and the like", "Name the sport in the note"]),
];

export function findBuiltinCardio(nameOrId: string): CardioActivity | undefined {
  const q = nameOrId.toLowerCase().trim();
  return BUILTIN_CARDIO.find((a) => a.id === nameOrId || a.name.toLowerCase() === q);
}
