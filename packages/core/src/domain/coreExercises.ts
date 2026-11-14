import type { Exercise } from "./exercise";

/**
 * The exercises every account starts with. The phone seeds them into its database; the web
 * dashboard (which only syncs custom exercises) uses this list for search and muscle groups.
 */
export const CORE_EXERCISES: Exercise[] = [
  { id: "ex_core_bench",        name: "Bench Press",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],               secondaryMuscles: ["triceps", "shoulders"] },
  { id: "ex_core_incline_bench",name: "Incline Bench Press",    notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest", "shoulders"],   secondaryMuscles: ["triceps"] },
  { id: "ex_core_squat",        name: "Squat",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings", "core"] },
  { id: "ex_core_front_squat",  name: "Front Squat",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads"],                 secondaryMuscles: ["glutes", "core"] },
  { id: "ex_core_deadlift",     name: "Deadlift",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "glutes"],        secondaryMuscles: ["hamstrings", "quads", "core", "forearms"] },
  { id: "ex_core_rdl",          name: "Romanian Deadlift",      notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["hamstrings", "glutes"],  secondaryMuscles: ["back", "core"] },
  { id: "ex_core_ohp",          name: "Overhead Press",         notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders"],             secondaryMuscles: ["triceps", "core"] },
  { id: "ex_core_pullup",       name: "Pull-Up",                notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "biceps"],        secondaryMuscles: ["shoulders", "core"] },
  { id: "ex_core_lat_pulldown", name: "Lat Pulldown",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders"] },
  { id: "ex_core_bb_row",       name: "Barbell Row",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders", "core"] },
  { id: "ex_core_db_row",       name: "Dumbbell Row",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps"] },
  { id: "ex_core_hip_thrust",   name: "Hip Thrust",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_lunge",        name: "Lunge",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_chest_fly",    name: "Chest Fly",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],                 secondaryMuscles: ["shoulders"] },
  { id: "ex_core_lat_raise",    name: "Lateral Raise",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders"],             secondaryMuscles: [] },
  { id: "ex_core_rear_delt",    name: "Rear Delt Fly",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders", "back"],     secondaryMuscles: [] },
  { id: "ex_core_bicep_curl",   name: "Bicep Curl",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["biceps"],                secondaryMuscles: ["forearms"] },
  { id: "ex_core_hammer_curl",  name: "Hammer Curl",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["biceps", "forearms"],    secondaryMuscles: [] },
  { id: "ex_core_tricep_push",  name: "Tricep Pushdown",        notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["triceps"],               secondaryMuscles: [] },
  { id: "ex_core_skullcrusher", name: "Skullcrusher",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["triceps"],               secondaryMuscles: [] },
  { id: "ex_core_leg_press",    name: "Leg Press",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_leg_curl",     name: "Leg Curl",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["hamstrings"],            secondaryMuscles: [] },
  { id: "ex_core_leg_ext",      name: "Leg Extension",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads"],                 secondaryMuscles: [] },
  { id: "ex_core_calf_raise",   name: "Calf Raise",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["calves"],                secondaryMuscles: [] },
  { id: "ex_core_plank",        name: "Plank",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["core"],                  secondaryMuscles: [] },
  { id: "ex_core_hlr",          name: "Hanging Leg Raise",      notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["core"],                  secondaryMuscles: [] },
  { id: "ex_core_pec_deck",     name: "Pec Deck",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],                 secondaryMuscles: ["shoulders"] },
  { id: "ex_core_tbar_row",     name: "T-Bar Row",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders"] },
  { id: "ex_core_hip_abduct",   name: "Hip Abduction",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: [] },
  { id: "ex_core_hip_adduct",   name: "Hip Adduction",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: [] },
  { id: "ex_core_back_ext",     name: "Machine Back Extension", notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "glutes"],        secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_dips",         name: "Dips",                   notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest", "triceps"],      secondaryMuscles: ["shoulders"] },
];

/** A core or custom exercise by name, case-insensitive. */
export function findExerciseByName<T extends { name: string }>(list: T[], name: string): T | undefined {
  const q = name.trim().toLowerCase();
  return list.find((e) => e.name.toLowerCase() === q);
}
