import { describe, expect, it } from "vitest";
import { readWorkoutCsv, summariseImport, toSessions, blockKindOf } from "./workoutImport";
import type { CardioBlockData, MobilityBlockData, StrengthBlockData } from "../domain/workout";

const TEMPLATE = `date,time,workout,exercise,set_type,weight,unit,reps,rpe,seconds,distance_km,notes,workout_notes
2026-11-18,07:30,Upper A,Bench Press,warmup,60,kg,8,,,,,
2026-11-18,07:30,Upper A,Bench Press,,100,kg,5,8,,,"grip wide, ""paused"" reps",Felt good
2026-11-18,07:30,Upper A,Bench Press,failure,80,kg,11,10,,,,
2026-11-18,07:30,Upper A,Pull Up,,,,10,,,,,
2026-11-18,07:30,Upper A,Bench Press,,225,lb,3,,,,,
2026-11-19,,Lower A,Plank,,,,,,60,,,
2026-11-19,,Lower A,Plank,,,,,,45,,,
2026-11-19,,Lower A,Squat,,140,,5,,,,,
2026-11-20,18:00,Cardio,Running,,,,,,1800,5,,
`;

describe("readWorkoutCsv: LogIt's spreadsheet layout", () => {
  const parsed = readWorkoutCsv(TEMPLATE);

  it("groups rows into workouts by date, time and name", () => {
    expect(parsed.workouts.map((w) => [w.title, w.exercises.map((e) => `${e.name}×${e.sets.length}`)])).toEqual([
      ["Upper A", ["Bench Press×3", "Pull Up×1", "Bench Press×1"]],
      ["Lower A", ["Plank×2", "Squat×1"]],
      ["Cardio", ["Running×1"]],
    ]);
    expect(new Date(parsed.workouts[0]!.startedAtMs).getHours()).toBe(7);
    expect(new Date(parsed.workouts[1]!.startedAtMs).getHours()).toBe(12); // no time: midday
    expect(parsed.workouts[0]!.note).toBe("Felt good");
  });

  it("keeps set types, RPE and notes with commas and quotes", () => {
    const bench = parsed.workouts[0]!.exercises[0]!.sets;
    expect(bench.map((s) => s.setType)).toEqual(["warmup", "normal", "failure"]);
    expect(bench[1]).toMatchObject({ weight: 100, unit: "kg", reps: 5, rpe: 8, note: 'grip wide, "paused" reps' });
  });

  it("asks for the unit only when a weight has none", () => {
    expect(parsed.unitUnknown).toBe(true); // the 140 squat
    expect(summariseImport(parsed).heaviestUnitless).toEqual({ name: "Squat", weight: 140 });
    expect(readWorkoutCsv("date,exercise,weight_kg,reps\n2026-11-20,Squat,140,5").unitUnknown).toBe(false);
  });

  it("makes holds from seconds and cardio from distance", () => {
    expect(blockKindOf(parsed.workouts[1]!.exercises[0]!)).toBe("hold");
    expect(blockKindOf(parsed.workouts[2]!.exercises[0]!)).toBe("cardio");
  });

  it("lists rows it couldn't read instead of guessing", () => {
    const p = readWorkoutCsv("date,exercise,reps\nyesterday,Squat,5\n2026-11-20,,5\n2026-11-20,Squat,\n2026-11-20,Squat,5");
    expect(p.problems).toEqual(["Line 2: no date LogIt can read", "Line 3: no exercise", "Line 4: no reps, seconds or distance"]);
    expect(p.workouts).toHaveLength(1);
  });

  it("reads 3/4/2026 day first unless a day over 12 says month first", () => {
    const dayFirst = readWorkoutCsv("date,exercise,reps\n3/4/2026,Squat,5");
    expect(new Date(dayFirst.workouts[0]!.startedAtMs).getMonth()).toBe(3); // April
    expect(dayFirst.slashDates).toBe("day-first");
    const monthFirst = readWorkoutCsv("date,exercise,reps\n3/4/2026,Squat,5\n12/25/2026,Squat,5");
    expect(new Date(monthFirst.workouts[0]!.startedAtMs).getMonth()).toBe(2); // March
  });

  it("reads a Hevy-style export: date inside start_time, month names, pounds, set types", () => {
    const hevy = readWorkoutCsv(`"title","start_time","end_time","exercise_title","set_index","set_type","weight_lbs","reps","rpe"
"Upper","5 Oct 2026, 07:00","5 Oct 2026, 08:05","Bench Press (Barbell)","0","warmup","111","10",""
"Upper","5 Oct 2026, 07:00","5 Oct 2026, 08:05","Bench Press (Barbell)","1","failure","185","8","9"
"Lower","Oct 8, 2026 18:30","Oct 8, 2026 19:30","Squat (Barbell)","0","normal","225","5",""
`);
    expect(hevy.problems).toEqual([]);
    expect(hevy.unitUnknown).toBe(false);
    const [upper, lower] = hevy.workouts;
    expect(new Date(upper!.startedAtMs)).toEqual(new Date(2026, 9, 5, 7, 0));
    expect(upper!.endedAtMs! - upper!.startedAtMs).toBe(65 * 60_000);
    expect(upper!.exercises[0]!.sets.map((x) => [x.setType, x.weight, x.unit, x.reps, x.rpe])).toEqual([
      ["warmup", 111, "lb", 10, undefined], ["failure", 185, "lb", 8, 9],
    ]);
    expect(new Date(lower!.startedAtMs)).toEqual(new Date(2026, 9, 8, 18, 30));
  });

  it("reads Strong's zero-filled columns as empty: a plank is a 60 s hold, not 0 reps", () => {
    const strong = readWorkoutCsv(`Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE
2026-09-07 18:00:00,Legs,Plank,1,0,0,0,60,
2026-09-07 18:00:00,Legs,Squat (Barbell),1,100,5,0,0,8
`);
    const [plank, squat] = strong.workouts[0]!.exercises;
    expect(plank!.sets[0]).toMatchObject({ seconds: 60 });
    expect(plank!.sets[0]!.reps).toBeUndefined();
    expect(blockKindOf(plank!)).not.toBe("strength");
    expect(squat!.sets[0]).toMatchObject({ weight: 100, reps: 5, rpe: 8 });
    expect(squat!.sets[0]!.seconds).toBeUndefined();
  });

  it("refuses a file that isn't a workout log", () => {
    expect(() => readWorkoutCsv("name,email\nx,y")).toThrow(/date and an exercise column/);
  });
});

describe("toSessions", () => {
  const parsed = readWorkoutCsv(TEMPLATE);
  const sessions = toSessions(parsed, { unit: "kg", exerciseFor: (name) => ({ name, exerciseId: name === "Bench Press" ? "core_bench_press" : undefined }) });

  it("turns each exercise into the right block, weights in kg", () => {
    const upper = sessions[0]!;
    expect(upper.name).toBe("Upper A");
    const bench = upper.blocks[0]!.data as StrengthBlockData;
    expect(bench.exerciseId).toBe("core_bench_press");
    expect(bench.sets.map((s) => [s.weight, s.reps, s.completed])).toEqual([[60, 8, true], [100, 5, true], [80, 11, true]]);
    expect((upper.blocks[2]!.data as StrengthBlockData).sets[0]!.weight).toBe(102.06); // 225 lb
    expect((sessions[1]!.blocks[0]!.data as MobilityBlockData).sets.map((s) => s.durationSec)).toEqual([60, 45]);
    expect((sessions[2]!.blocks[0]!.data as CardioBlockData).intervals[0]).toMatchObject({ durationMs: 1_800_000, distanceM: 5000 });
  });

  it("marks every workout finished; with no duration in the file it ends when it starts", () => {
    expect(sessions.every((s) => s.endedAtMs === s.startedAtMs)).toBe(true);
    const timed = readWorkoutCsv("date,time,exercise,reps,duration_min\n2026-11-20,07:00,Squat,5,65");
    expect(toSessions(timed, { unit: "kg", exerciseFor: (name) => ({ name }) })[0]!.endedAtMs! - timed.workouts[0]!.startedAtMs).toBe(65 * 60_000);
  });

  it("gives the same ids to the same workouts every time, so nothing is imported twice", () => {
    const again = toSessions(readWorkoutCsv(TEMPLATE), { unit: "kg", exerciseFor: (name) => ({ name }) });
    expect(again.map((s) => s.id)).toEqual(sessions.map((s) => s.id));
    expect(new Set(sessions.map((s) => s.id)).size).toBe(3);
  });
});
