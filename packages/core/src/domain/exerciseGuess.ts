import type { Equipment, Exercise, MuscleGroup } from "./exercise";

/**
 * An exercise someone made by name (an "Add 'X'", a best lift, an import) has no muscles until
 * they say. Until then it counts toward no weekly sets, so the workout asks once ("Finish
 * setting it up", design canvas I3), with these guesses picked.
 */
export function needsSetup(exercise: Pick<Exercise, "isCore" | "primaryMuscles">): boolean {
  return !exercise.isCore && exercise.primaryMuscles.length === 0;
}

// First match wins, so the specific names come before the general ones ("leg curl" before "curl").
const MUSCLE_RULES: [RegExp, MuscleGroup[]][] = [
  [/leg curl|hamstring curl|nordic/, ["hamstrings"]],
  [/leg extension/, ["quads"]],
  [/calf|calves/, ["calves"]],
  [/hip thrust|glute bridge|bridge|kickback|abduct/, ["glutes"]],
  [/romanian|rdl|stiff.?leg|good ?morning|deadlift|hinge|swing/, ["hamstrings", "glutes", "back"]],
  [/squat|lunge|leg press|step.?up|hack/, ["quads", "glutes"]],
  [/pull.?up|chin.?up|pulldown|pull.?down|\brow\b|rows\b|pullover/, ["back", "biceps"]],
  [/shrug/, ["back"]],
  [/lateral raise|side raise|rear delt|face pull|reverse fly|upright row/, ["shoulders"]],
  [/overhead|ohp|military|shoulder press|arnold|push press|landmine press/, ["shoulders", "triceps"]],
  [/back extension|hyperextension|reverse hyper/, ["back", "glutes"]],
  [/tricep|pushdown|push.?down|skull|extension|jm press|close.?grip/, ["triceps"]],
  [/bench|chest|incline|decline|push.?up|fly\b|flye|dip|press/, ["chest", "triceps"]],
  [/curl/, ["biceps"]],
  [/wrist|grip|farmer|carry/, ["forearms"]],
  [/plank|crunch|sit.?up|\bab\b|abs\b|core|leg raise|rollout|pallof|woodchop|hollow/, ["core"]],
];

const EQUIPMENT_RULES: [RegExp, Equipment][] = [
  [/smith/, "smith"],
  [/cable|pulley/, "cable"],
  [/machine|leg press|pulldown|pull.?down|hack|pec deck|selectorized/, "machine"],
  [/dumbbell|\bdb\b/, "dumbbell"],
  [/kettlebell|\bkb\b/, "kettlebell"],
  [/band/, "band"],
  [/barbell|\bbb\b|ssb|safety bar|trap bar|ez.?bar|\bbar\b/, "barbell"],
  [/pull.?up|chin.?up|push.?up|dip|plank|bodyweight/, "bodyweight"],
];

export function guessExerciseSetup(name: string): { primaryMuscles: MuscleGroup[]; equipment?: Equipment } {
  const n = name.toLowerCase();
  return {
    primaryMuscles: MUSCLE_RULES.find(([re]) => re.test(n))?.[1] ?? [],
    equipment: EQUIPMENT_RULES.find(([re]) => re.test(n))?.[1],
  };
}
