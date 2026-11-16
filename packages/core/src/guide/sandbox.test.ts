import { describe, expect, it } from "vitest";
import { createCheckinSchedule, addQuestion, currentPeriodIndex } from "../domain/Checkin";
import { createCoachProgram, setProgramStart, type CoachProgram } from "../domain/CoachProgram";
import { coreExerciseById } from "../domain/coreExercises";
import { dayTotals } from "../domain/nutrition";
import { getExercises } from "../domain/workout";
import { planSampleActions, sampleHistory, answerCheckin, sampleSpec, REPLY_AFTER_MS, type SampleState } from "./sandbox";

const NOW = new Date(2026, 10, 16, 12, 0, 0).getTime(); // a Monday

function programWithOneDay(): CoachProgram {
  const p = createCoachProgram("Beginner full body");
  const day = {
    id: "day1", orderIndex: 0, name: "Full body A",
    blocks: [{
      type: "strength" as const, id: "b1", orderIndex: 0, exerciseName: "Squat", exerciseId: "core_squat",
      sets: [1, 2, 3].map((i) => ({ id: `s${i}`, orderIndex: i, setType: "normal" as const, reps: 5, weight: 40 })),
    }],
  };
  return { ...p, weeks: [{ ...p.weeks[0], days: [day] }] };
}

function state(patch: Partial<SampleState>): SampleState {
  return {
    key: "conor", status: "Active", activeLinkCodes: [], programs: [], sessions: [], schedules: [],
    submissions: [], thread: [], coachId: "coach-1", ...patch,
  };
}

describe("sample history", () => {
  it("gives Conor four weeks of workouts, food and weight that read back like the app's own", () => {
    const h = sampleHistory("conor", NOW);
    expect(h.sessions.length).toBeGreaterThanOrEqual(10);
    expect(h.days.length).toBe(27);
    expect(h.weights.length).toBeGreaterThan(10);
    for (const s of h.sessions) {
      const back = JSON.parse(JSON.stringify(s));
      const exercises = getExercises(back);
      expect(exercises.length).toBeGreaterThan(0);
      for (const e of exercises) {
        expect(coreExerciseById(e.exerciseId!), e.exerciseName).toBeTruthy();
        expect(e.sets.every((set) => set.completed && set.reps > 0 && set.weight > 0)).toBe(true);
      }
      expect(s.startedAtMs).toBeLessThan(NOW);
    }
    for (const d of h.days) expect(dayTotals(d).kcal).toBeGreaterThan(1500);
    // Lifts go up over the four weeks.
    const bench = h.sessions.flatMap((s) => getExercises(s)).filter((e) => e.exerciseId === "core_bench_press");
    expect(bench.at(-1)!.sets[0].weight).toBeGreaterThan(bench[0].sets[0].weight);
  });

  it("gives Dara workouts only, and Niamh nothing until she joins", () => {
    const dara = sampleHistory("dara", NOW);
    expect(dara.sessions.length).toBeGreaterThan(5);
    expect(dara.days).toEqual([]);
    expect(sampleHistory("niamh", NOW)).toEqual({ sessions: [], days: [], weights: [] });
  });
});

describe("what a sample client does", () => {
  it("Niamh asks through the coach's first working link, and does nothing else until accepted", () => {
    expect(planSampleActions(state({ key: "niamh", status: "None", activeLinkCodes: ["K7Q2-MX9A"] }), NOW))
      .toEqual([{ kind: "request", code: "K7Q2-MX9A" }]);
    expect(planSampleActions(state({ key: "niamh", status: "None" }), NOW)).toEqual([]);
    expect(planSampleActions(state({ key: "niamh", status: "Pending", activeLinkCodes: ["X"] }), NOW)).toEqual([]);
    // Conor is never the one who asks.
    expect(planSampleActions(state({ key: "conor", status: "None", activeLinkCodes: ["X"] }), NOW)).toEqual([]);
  });

  it("starts a program they're given and logs its first day once", () => {
    const program = programWithOneDay();
    const actions = planSampleActions(state({ programs: [program] }), NOW);
    expect(actions.map((a) => a.kind)).toEqual(["start", "log"]);
    const log = actions[1] as Extract<(typeof actions)[number], { kind: "log" }>;
    expect(log.session.source).toMatchObject({ kind: "program", parentId: program.id, dayId: "day1", coachId: "coach-1" });
    expect(getExercises(log.session)[0].sets.map((s) => [s.reps, s.weight, s.completed])).toEqual([[5, 40, true], [5, 40, true], [5, 40, true]]);

    const started = { ...program, startedAtMs: NOW - 1000 };
    expect(planSampleActions(state({ programs: [started], sessions: [log.session] }), NOW)).toEqual([]);
  });

  it("waits for a program set to start on a later date", () => {
    const later = setProgramStart(programWithOneDay(), { mode: "fixed-date", startDateMs: NOW + 3 * 86_400_000 });
    expect(planSampleActions(state({ programs: [later] }), NOW)).toEqual([]);
  });

  it("fills in a check-in once per period, answering every question it can", () => {
    let schedule = createCheckinSchedule();
    schedule = addQuestion({ ...schedule, anchorMs: NOW - 86_400_000 }, { prompt: "Progress photo", type: "photo" });
    const actions = planSampleActions(state({ schedules: [schedule] }), NOW);
    expect(actions.map((a) => a.kind)).toEqual(["submit"]);
    const sub = (actions[0] as Extract<(typeof actions)[number], { kind: "submit" }>).submission;
    expect(sub.submittedAtMs).toBeTruthy();
    expect(sub.answers).toHaveLength(3); // text, weight, scale; the photo is left blank
    expect(sub.answers.find((a) => a.text)?.text).toBe(sampleSpec("conor")!.checkinNote);

    const period = currentPeriodIndex(schedule, NOW)!;
    const done = answerCheckin(sampleSpec("conor")!, schedule, period);
    expect(planSampleActions(state({ schedules: [schedule], submissions: [done] }), NOW)).toEqual([]);
  });

  it("replies to the coach's latest message after a few seconds, with the next set reply", () => {
    const coachMsg = (at: number) => ({ messageId: `c${at}`, body: "How's the knee?", createdAtMs: at, readAtMs: null, mine: false });
    const mine = (at: number) => ({ messageId: `m${at}`, body: "ok", createdAtMs: at, readAtMs: null, mine: true });
    expect(planSampleActions(state({ thread: [coachMsg(NOW - 1000)] }), NOW)).toEqual([]);
    expect(planSampleActions(state({ thread: [coachMsg(NOW - REPLY_AFTER_MS)] }), NOW))
      .toEqual([{ kind: "reply", body: sampleSpec("conor")!.replies[0] }]);
    expect(planSampleActions(state({ thread: [coachMsg(NOW - 60_000), mine(NOW - 50_000), coachMsg(NOW - 40_000)] }), NOW))
      .toEqual([{ kind: "reply", body: sampleSpec("conor")!.replies[1] }]);
    expect(planSampleActions(state({ thread: [coachMsg(NOW - 60_000), mine(NOW - 50_000)] }), NOW)).toEqual([]);
  });
});
