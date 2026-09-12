// The program library's v1 content (adaptive-progression-engine.md §6) — a
// small set of built-in starter "series" a solo user can pick and follow
// with zero exposure to the reasoning-trace/muscle-group-insight/rep-range
// engine (§3-5, §10). Authored as ordinary CoachProgram template records
// (recipientUserId/username null, same shape a coach's own templates use) —
// this is seed data, not a new content model. Martin's decision (2026-09-12):
// four programs, one representative week each — these are repeating routines
// (the same week trained on a loop), not dated multi-week arcs, so
// `lengthWeeks: 1` and `startMode: "manual"` (no auto-started date) are
// deliberate: the user re-starts whichever day they're on via the existing
// per-day "Start" flow (see /programs/[id] and /programs/builtin/[id]),
// same manual pattern a coach-assigned program already uses. No exerciseId
// is set — these reference exercises by name only, same precedent as
// onboarding's own split presets (routes/onboarding/+page.svelte).
import {
  createCoachProgram,
  addDay,
  addStrengthBlock,
  addSet,
  type CoachProgram,
} from "./CoachProgram";

type ExerciseSpec = { name: string; sets: number; reps: number | [number, number] };
type DaySpec = { name: string; exercises: ExerciseSpec[] };

function buildProgram(id: string, name: string, description: string, days: DaySpec[]): CoachProgram {
  let program = createCoachProgram(name);
  program = { ...program, id, description, startMode: "manual" };
  const weekId = program.weeks[0]!.id;

  for (const day of days) {
    program = addDay(program, weekId, day.name);
    const dayId = program.weeks[0]!.days.at(-1)!.id;
    for (const exercise of day.exercises) {
      program = addStrengthBlock(program, weekId, dayId, { exerciseName: exercise.name });
      const blockId = program.weeks[0]!.days.find((d) => d.id === dayId)!.blocks.at(-1)!.id;
      const [repsMin, repsMax] = Array.isArray(exercise.reps) ? exercise.reps : [exercise.reps, undefined];
      for (let i = 0; i < exercise.sets; i++) {
        program = addSet(program, weekId, dayId, blockId, {
          reps: repsMax === undefined ? repsMin : undefined,
          repsMin: repsMax === undefined ? undefined : repsMin,
          repsMax,
        });
      }
    }
  }

  return { ...program, id, createdAtMs: 0, updatedAtMs: 0 };
}

export const BUILTIN_PROGRAM_IDS = [
  "builtin-full-body-3x",
  "builtin-upper-lower-4x",
  "builtin-ppl-6x",
  "builtin-strength-5x5",
] as const;

export type BuiltinProgramId = (typeof BUILTIN_PROGRAM_IDS)[number];

export function isBuiltinProgramId(id: string): id is BuiltinProgramId {
  return (BUILTIN_PROGRAM_IDS as readonly string[]).includes(id);
}

export const BUILTIN_PROGRAMS: CoachProgram[] = [
  buildProgram(
    "builtin-full-body-3x",
    "Full-Body 3x/week",
    "A classic beginner linear-progression routine — three full-body sessions a week, add weight when you hit the top of your rep range.",
    [
      {
        name: "Full Body A",
        exercises: [
          { name: "Squat", sets: 3, reps: 5 },
          { name: "Bench Press", sets: 3, reps: 5 },
          { name: "Barbell Row", sets: 3, reps: 5 },
        ],
      },
      {
        name: "Full Body B",
        exercises: [
          { name: "Squat", sets: 3, reps: 5 },
          { name: "Overhead Press", sets: 3, reps: 5 },
          { name: "Deadlift", sets: 1, reps: 5 },
        ],
      },
      {
        name: "Full Body C",
        exercises: [
          { name: "Squat", sets: 3, reps: 5 },
          { name: "Bench Press", sets: 3, reps: 5 },
          { name: "Barbell Row", sets: 3, reps: 5 },
        ],
      },
    ],
  ),
  buildProgram(
    "builtin-upper-lower-4x",
    "Upper/Lower 4x/week",
    "An intermediate split — two upper and two lower sessions a week, compound lifts first, accessories after.",
    [
      {
        name: "Upper A",
        exercises: [
          { name: "Bench Press", sets: 4, reps: 5 },
          { name: "Barbell Row", sets: 4, reps: [8, 10] },
          { name: "Overhead Press", sets: 3, reps: [8, 10] },
          { name: "Bicep Curl", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Lower A",
        exercises: [
          { name: "Squat", sets: 4, reps: 5 },
          { name: "Romanian Deadlift", sets: 3, reps: [8, 10] },
          { name: "Leg Press", sets: 3, reps: [10, 12] },
          { name: "Calf Raise", sets: 3, reps: [12, 15] },
        ],
      },
      {
        name: "Upper B",
        exercises: [
          { name: "Overhead Press", sets: 4, reps: 5 },
          { name: "Pull-Up", sets: 4, reps: [8, 10] },
          { name: "Lateral Raise", sets: 3, reps: [12, 15] },
          { name: "Tricep Pushdown", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Lower B",
        exercises: [
          { name: "Deadlift", sets: 3, reps: 5 },
          { name: "Leg Press", sets: 3, reps: [10, 12] },
          { name: "Leg Curl", sets: 3, reps: [10, 12] },
          { name: "Calf Raise", sets: 3, reps: [12, 15] },
        ],
      },
    ],
  ),
  buildProgram(
    "builtin-ppl-6x",
    "Push/Pull/Legs 6x/week",
    "Higher-frequency bodybuilding split for training most days — push, pull, and legs, twice through each week.",
    [
      {
        name: "Push A",
        exercises: [
          { name: "Bench Press", sets: 4, reps: [6, 8] },
          { name: "Overhead Press", sets: 3, reps: [8, 10] },
          { name: "Lateral Raise", sets: 3, reps: [12, 15] },
          { name: "Tricep Pushdown", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Pull A",
        exercises: [
          { name: "Pull-Up", sets: 4, reps: [6, 8] },
          { name: "Barbell Row", sets: 3, reps: [8, 10] },
          { name: "Rear Delt Fly", sets: 3, reps: [12, 15] },
          { name: "Bicep Curl", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Legs A",
        exercises: [
          { name: "Squat", sets: 4, reps: [6, 8] },
          { name: "Romanian Deadlift", sets: 3, reps: [8, 10] },
          { name: "Leg Curl", sets: 3, reps: [10, 12] },
          { name: "Calf Raise", sets: 3, reps: [12, 15] },
        ],
      },
      {
        name: "Push B",
        exercises: [
          { name: "Overhead Press", sets: 4, reps: [6, 8] },
          { name: "Bench Press", sets: 3, reps: [8, 10] },
          { name: "Lateral Raise", sets: 3, reps: [12, 15] },
          { name: "Tricep Pushdown", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Pull B",
        exercises: [
          { name: "Barbell Row", sets: 4, reps: [6, 8] },
          { name: "Pull-Up", sets: 3, reps: [8, 10] },
          { name: "Rear Delt Fly", sets: 3, reps: [12, 15] },
          { name: "Bicep Curl", sets: 3, reps: [10, 12] },
        ],
      },
      {
        name: "Legs B",
        exercises: [
          { name: "Deadlift", sets: 3, reps: 5 },
          { name: "Leg Press", sets: 3, reps: [8, 10] },
          { name: "Leg Curl", sets: 3, reps: [10, 12] },
          { name: "Calf Raise", sets: 3, reps: [12, 15] },
        ],
      },
    ],
  ),
  buildProgram(
    "builtin-strength-5x5",
    "5x5 Strength",
    "3x/week, 5 sets of 5 on the main lifts, alternating two workouts — simple weekly load increases (StrongLifts pattern).",
    [
      {
        name: "Workout A",
        exercises: [
          { name: "Squat", sets: 5, reps: 5 },
          { name: "Bench Press", sets: 5, reps: 5 },
          { name: "Barbell Row", sets: 5, reps: 5 },
        ],
      },
      {
        name: "Workout B",
        exercises: [
          { name: "Squat", sets: 5, reps: 5 },
          { name: "Overhead Press", sets: 5, reps: 5 },
          { name: "Deadlift", sets: 1, reps: 5 },
        ],
      },
    ],
  ),
];

export function getBuiltinProgram(id: string): CoachProgram | null {
  return BUILTIN_PROGRAMS.find((p) => p.id === id) ?? null;
}
