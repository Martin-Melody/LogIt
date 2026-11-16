// The coach sandbox's sample clients: who they are, the history they start with, and what
// they do in reply to their coach. Pure functions only; sandboxDriver.ts runs them against
// the API. Everything is built with the same domain code the apps use (sessions, diary days,
// check-in answers, program-day workouts), so a change to those shapes reaches the samples
// too, and sandbox.test.ts checks the result still reads back the way the apps read it.

import { SHARE_ALL, type Sharing } from "../api/coachApi";
import type { RemoteMessage } from "../api/messagesApi";
import {
  createSubmission, currentPeriodIndex, markSubmitted, setAnswer,
  type CheckinQuestion, type CheckinSchedule, type CheckinSubmission,
} from "../domain/Checkin";
import type { CoachProgram } from "../domain/CoachProgram";
import { coreExerciseById } from "../domain/coreExercises";
import { createId } from "../domain/ids";
import { addDiaryItem, createDiaryDay, createWeightEntry, type DiaryDay, type WeightEntry } from "../domain/nutrition";
import { programDaySession } from "../domain/programDaySession";
import { addExercise, addSet, getExercises, type WorkoutSession } from "../domain/workout";

export type SampleKey = "niamh" | "conor" | "dara";

export type SampleSpec = {
  key: SampleKey;
  displayName: string;
  /** Coached from the start. Niamh isn't: she asks through the coach's first invite link. */
  active: boolean;
  sharing: Sharing;
  /** Shown when the coach adds them. */
  about: string;
  /** Messages they send back, in turn. */
  replies: string[];
  /** Their answer to a free-text check-in question. */
  checkinNote: string;
  /** Their bodyweight now, for weight questions and the weight log. */
  weightKg: number;
};

export const SAMPLE_CLIENTS: SampleSpec[] = [
  {
    key: "niamh",
    displayName: "Niamh",
    active: false,
    sharing: { ...SHARE_ALL },
    about: "New. Asks to join through the first invite link you make, then starts the program you give her and logs a workout.",
    replies: ["Thank you! Excited to get started.", "Done my first session, the squats felt good.", "Will do, thanks!"],
    checkinNote: "Loved the first week. A bit sore after the squats but fine now.",
    weightKg: 63.2,
  },
  {
    key: "conor",
    displayName: "Conor",
    active: true,
    sharing: { ...SHARE_ALL },
    about: "Already your client, with 4 weeks of workouts, food and weight. Fills in your check-ins and answers your messages. His knee is bothering him.",
    replies: [
      "Thanks, that makes sense. I'll swap them for leg press this week.",
      "Leg press went well, no knee pain at all.",
      "Sounds good, talk Sunday.",
    ],
    checkinNote: "Knee felt off on squats again on Thursday. Could I swap them for leg press for a week or two?",
    weightKg: 82.4,
  },
  {
    key: "dara",
    displayName: "Dara",
    active: true,
    sharing: { workouts: true, nutrition: false, bodyweight: false, habits: false, checkins: false },
    about: "Shares training only, so you see what a client's privacy switches look like from your side.",
    replies: ["Cheers!", "Will do.", "Grand, thanks."],
    checkinNote: "All good this week.",
    weightKg: 71.8,
  },
];

export const sampleSpec = (key: string) => SAMPLE_CLIENTS.find((s) => s.key === key);

// ── Starting history ────────────────────────────────────────────────────────

const DAY = 86_400_000;

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type Lift = { id: string; sets: number; reps: number; startKg: number; stepKg: number };

const UPPER: Lift[] = [
  { id: "core_bench_press", sets: 3, reps: 8, startKg: 72.5, stepKg: 2.5 },
  { id: "core_barbell_row", sets: 3, reps: 10, startKg: 60, stepKg: 2.5 },
  { id: "core_overhead_press", sets: 3, reps: 8, startKg: 42.5, stepKg: 1.25 },
  { id: "core_lat_pulldown", sets: 3, reps: 12, startKg: 55, stepKg: 2.5 },
];
const LOWER: Lift[] = [
  { id: "core_squat", sets: 3, reps: 6, startKg: 100, stepKg: 2.5 },
  { id: "core_romanian_deadlift", sets: 3, reps: 8, startKg: 80, stepKg: 2.5 },
  { id: "core_leg_press", sets: 3, reps: 12, startKg: 140, stepKg: 5 },
];

/** A finished workout of `lifts` at week `week`'s weights (heavier each week). */
function pastWorkout(name: string, lifts: Lift[], week: number, scale: number, startedAtMs: number): WorkoutSession {
  let s: WorkoutSession = { id: createId("sess"), startedAtMs, endedAtMs: startedAtMs + 55 * 60_000, blocks: [], name };
  for (const lift of lifts) {
    const ex = coreExerciseById(lift.id);
    if (!ex) continue;
    s = addExercise(s, { exerciseName: ex.name, exerciseId: ex.id });
    const entryId = getExercises(s).at(-1)!.id;
    const kg = Math.round(((lift.startKg + lift.stepKg * week) * scale) / 1.25) * 1.25;
    for (let i = 0; i < lift.sets; i++) s = addSet(s, entryId, { reps: lift.reps, weight: kg });
  }
  return completeAllSets(s);
}

function completeAllSets(s: WorkoutSession): WorkoutSession {
  return {
    ...s,
    blocks: s.blocks.map((b) =>
      b.type === "strength"
        ? { ...b, data: { ...(b.data as object), sets: ((b.data as { sets: { reps: number }[] }).sets ?? []).map((set) => ({ ...set, completed: true })) } }
        : b,
    ),
  };
}

const MEALS: { meal: "breakfast" | "lunch" | "dinner" | "snack"; name: string; grams: number; kcal: number; p: number; c: number; f: number }[] = [
  { meal: "breakfast", name: "Porridge with berries", grams: 350, kcal: 420, p: 16, c: 68, f: 9 },
  { meal: "lunch", name: "Chicken and rice", grams: 450, kcal: 690, p: 52, c: 80, f: 14 },
  { meal: "snack", name: "Greek yoghurt", grams: 200, kcal: 190, p: 20, c: 8, f: 8 },
  { meal: "dinner", name: "Beef chilli", grams: 500, kcal: 760, p: 48, c: 70, f: 28 },
  { meal: "snack", name: "Protein shake", grams: 330, kcal: 220, p: 30, c: 10, f: 5 },
];

export type SampleHistory = { sessions: WorkoutSession[]; days: DiaryDay[]; weights: WeightEntry[] };

/** Four weeks before `now`, made fresh each time the sandbox is added (dates follow today). */
export function sampleHistory(key: SampleKey, now: number): SampleHistory {
  const spec = sampleSpec(key)!;
  if (!spec.active) return { sessions: [], days: [], weights: [] };
  const today = startOfDay(now);
  const sessions: WorkoutSession[] = [];
  const days: DiaryDay[] = [];
  const weights: WeightEntry[] = [];
  const scale = key === "dara" ? 0.7 : 1;
  // Mon, Wed, Fri at 07:30 (Conor) or Tue, Thu (Dara), for 4 weeks; the latest week has one fewer.
  const pattern = key === "conor" ? [0, 2, 4] : [1, 3];
  for (let back = 27; back >= 1; back--) {
    const dayMs = today - back * DAY;
    const weekday = (new Date(dayMs).getDay() + 6) % 7; // Monday = 0
    const week = Math.floor((27 - back) / 7);
    if (pattern.includes(weekday) && !(back <= 3 && weekday === pattern.at(-1))) {
      const upper = sessions.length % 2 === 0;
      sessions.push(pastWorkout(upper ? "Upper" : "Lower", upper ? UPPER : LOWER, week, scale, dayMs + 7.5 * 3_600_000));
    }
    if (key === "conor") {
      let day = { ...createDiaryDay(isoDate(dayMs)), createdAtMs: dayMs + 20 * 3_600_000, updatedAtMs: dayMs + 20 * 3_600_000 };
      for (const [i, m] of MEALS.entries()) {
        if (i === 4 && back % 2 === 0) continue; // a shake most days, not all
        day = addDiaryItem(day, {
          meal: m.meal, name: m.name, grams: m.grams,
          computed: { kcal: m.kcal, proteinG: m.p, carbsG: m.c, fatG: m.f },
          loggedAtMs: dayMs + (8 + i * 3) * 3_600_000,
        });
      }
      days.push({ ...day, updatedAtMs: dayMs + 21 * 3_600_000 });
      if (back % 2 === 1) {
        const kg = Math.round((spec.weightKg + back * 0.045) * 10) / 10;
        weights.push({ ...createWeightEntry(isoDate(dayMs), kg), createdAtMs: dayMs + 7 * 3_600_000, updatedAtMs: dayMs + 7 * 3_600_000 });
      }
    }
  }
  return { sessions, days, weights };
}

// ── What a sample does next ─────────────────────────────────────────────────

/** Everything the driver read for one sample client. */
export type SampleState = {
  key: SampleKey;
  /** The sandbox's view: "None" until Niamh asks, then "Pending", "Active". */
  status: string;
  /** The coach's invite links that work right now. */
  activeLinkCodes: string[];
  /** As the sample: programs assigned to them (with the client-side start time). */
  programs: (CoachProgram & { startedAtMs?: number | null })[];
  sessions: WorkoutSession[];
  schedules: CheckinSchedule[];
  submissions: CheckinSubmission[];
  /** Their thread with the coach, oldest first; `mine` = sent by the sample. */
  thread: RemoteMessage[];
  coachId: string;
};

export type SampleAction =
  | { kind: "request"; code: string }
  | { kind: "start"; programId: string; startedAtMs: number }
  | { kind: "log"; session: WorkoutSession }
  | { kind: "submit"; submission: CheckinSubmission }
  | { kind: "reply"; body: string };

/** How long after the coach acts a sample answers: soon enough to watch, not instant. */
export const REPLY_AFTER_MS = 4_000;

export function planSampleActions(state: SampleState, now: number): SampleAction[] {
  const spec = sampleSpec(state.key);
  if (!spec) return [];
  const actions: SampleAction[] = [];

  if (state.status === "None") {
    if (spec.key === "niamh" && state.activeLinkCodes.length > 0) actions.push({ kind: "request", code: state.activeLinkCodes[0] });
    return actions;
  }
  if (state.status !== "Active") return actions;

  for (const program of state.programs) {
    if (program.archived) continue;
    // A program set to start on a later date waits for that date, as it would for a real client.
    if (program.startMode === "fixed-date" && (program.startDateMs ?? 0) > now) continue;
    const firstDay = program.weeks[0]?.days.slice().sort((a, b) => a.orderIndex - b.orderIndex)[0];
    const started = program.startMode === "fixed-date" || program.startedAtMs != null;
    if (!started) actions.push({ kind: "start", programId: program.id, startedAtMs: startOfDay(now) });
    const logged = state.sessions.some((s) => s.source?.kind === "program" && s.source.parentId === program.id);
    if (!logged && firstDay && firstDay.blocks.length > 0) {
      const planned = programDaySession(firstDay);
      const session: WorkoutSession = completeAllSets({
        ...planned,
        startedAtMs: now - 50 * 60_000,
        endedAtMs: now,
        source: {
          kind: "program", parentId: program.id, parentName: program.name, coachId: state.coachId,
          dayId: firstDay.id, dayName: firstDay.name || "Day 1", dayNumber: 1,
        },
      });
      actions.push({ kind: "log", session });
    }
  }

  for (const schedule of state.schedules) {
    if (schedule.archived || schedule.questions.length === 0) continue;
    const period = currentPeriodIndex(schedule, now);
    if (period == null) continue;
    const sent = state.submissions.some((s) => s.scheduleId === schedule.id && s.periodIndex === period && s.submittedAtMs);
    if (!sent) actions.push({ kind: "submit", submission: answerCheckin(spec, schedule, period) });
  }

  const last = state.thread.at(-1);
  if (last && !last.mine && now - last.createdAtMs >= REPLY_AFTER_MS) {
    const sentSoFar = state.thread.filter((m) => m.mine).length;
    actions.push({ kind: "reply", body: spec.replies[sentSoFar % spec.replies.length] });
  }
  return actions;
}

function answerFor(spec: SampleSpec, q: CheckinQuestion) {
  switch (q.type) {
    case "scale": {
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 10;
      return { number: Math.round(min + (max - min) * 0.6) };
    }
    case "number": return { number: 7 };
    case "weight": return { number: spec.weightKg };
    case "boolean": return { bool: true };
    case "text": return { text: spec.checkinNote };
    default: return undefined; // a photo question is left blank
  }
}

export function answerCheckin(spec: SampleSpec, schedule: CheckinSchedule, period: number): CheckinSubmission {
  let sub = createSubmission(schedule, period);
  for (const q of schedule.questions) {
    const a = answerFor(spec, q);
    if (a) sub = setAnswer(sub, q.id, a);
  }
  return markSubmitted(sub);
}
