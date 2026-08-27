import { createId } from "./ids";
import { nowMs } from "./time";

// Structured coach check-ins. A CheckinSchedule is authored by a coach and assigned to a
// client (coach→client, read-only for the client — same shape as CoachProgram). The
// client's answers are CheckinSubmission rows that sync back the normal client→coach
// direction (like workout sessions).

export type CheckinQuestionType = "text" | "number" | "scale" | "weight" | "boolean" | "photo";

export type CheckinCadence = "weekly" | "biweekly" | "monthly" | "manual";

export type CheckinQuestion = {
  id: string;
  prompt: string;
  type: CheckinQuestionType;
  required?: boolean;
  /** For "scale": the endpoints (default 1–10). */
  scaleMin?: number;
  scaleMax?: number;
};

export type CheckinSchedule = {
  id: string;
  name: string;
  cadence: CheckinCadence;
  /** Epoch ms anchoring period 0. Occurrences count forward from here by the cadence. */
  anchorMs: number;
  questions: CheckinQuestion[];
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type CheckinAnswer = {
  questionId: string;
  text?: string;
  number?: number;
  bool?: boolean;
  photoDataUrl?: string;
};

export type CheckinSubmission = {
  id: string;
  scheduleId: string;
  /** 0-based occurrence index from the schedule anchor. */
  periodIndex: number;
  periodStartMs: number;
  answers: CheckinAnswer[];
  /** Set when the client submits; undefined while still a draft. */
  submittedAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function cadenceMs(cadence: CheckinCadence): number {
  switch (cadence) {
    case "weekly": return 7 * DAY_MS;
    case "biweekly": return 14 * DAY_MS;
    case "monthly": return 30 * DAY_MS;
    case "manual": return 0;
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export function createCheckinSchedule(name: string = "Weekly check-in"): CheckinSchedule {
  const now = nowMs();
  return {
    id: createId("ckin"),
    name: name.trim() || "Check-in",
    cadence: "weekly",
    anchorMs: now,
    questions: [
      { id: createId("ckq"), prompt: "How did training go this week?", type: "text", required: true },
      { id: createId("ckq"), prompt: "Bodyweight", type: "weight" },
      { id: createId("ckq"), prompt: "Energy (1–10)", type: "scale", scaleMin: 1, scaleMax: 10 },
    ],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function touchCheckinSchedule(s: CheckinSchedule): CheckinSchedule {
  return { ...s, updatedAtMs: nowMs() };
}

export function renameCheckinSchedule(s: CheckinSchedule, name: string): CheckinSchedule {
  return touchCheckinSchedule({ ...s, name: name.trim() || "Check-in" });
}

export function setCadence(s: CheckinSchedule, cadence: CheckinCadence): CheckinSchedule {
  return touchCheckinSchedule({ ...s, cadence });
}

export function archiveCheckinSchedule(s: CheckinSchedule, archived = true): CheckinSchedule {
  return touchCheckinSchedule({ ...s, archived });
}

export function addQuestion(
  s: CheckinSchedule,
  question: Omit<CheckinQuestion, "id"> = { prompt: "New question", type: "text" },
): CheckinSchedule {
  return touchCheckinSchedule({
    ...s,
    questions: [...s.questions, { ...question, id: createId("ckq") }],
  });
}

export function updateQuestion(
  s: CheckinSchedule,
  questionId: string,
  patch: Partial<Omit<CheckinQuestion, "id">>,
): CheckinSchedule {
  return touchCheckinSchedule({
    ...s,
    questions: s.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
  });
}

export function removeQuestion(s: CheckinSchedule, questionId: string): CheckinSchedule {
  return touchCheckinSchedule({
    ...s,
    questions: s.questions.filter((q) => q.id !== questionId),
  });
}

// ── Occurrences ───────────────────────────────────────────────────────────────

/** The current 0-based occurrence index, or null for a manual (on-demand) schedule. */
export function currentPeriodIndex(s: CheckinSchedule, atMs: number = nowMs()): number | null {
  const step = cadenceMs(s.cadence);
  if (step === 0) return null;
  const elapsed = atMs - s.anchorMs;
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / step);
}

export function periodStartMs(s: CheckinSchedule, index: number): number {
  const step = cadenceMs(s.cadence);
  return step === 0 ? s.anchorMs : s.anchorMs + index * step;
}

// ── Submission ────────────────────────────────────────────────────────────────

export function createSubmission(
  schedule: CheckinSchedule,
  periodIndex: number,
): CheckinSubmission {
  const now = nowMs();
  return {
    id: createId("cksub"),
    scheduleId: schedule.id,
    periodIndex,
    periodStartMs: periodStartMs(schedule, periodIndex),
    answers: [],
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function setAnswer(
  submission: CheckinSubmission,
  questionId: string,
  value: Omit<CheckinAnswer, "questionId">,
): CheckinSubmission {
  const others = submission.answers.filter((a) => a.questionId !== questionId);
  const cleaned = Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ""),
  );
  const next =
    Object.keys(cleaned).length === 0
      ? others
      : [...others, { questionId, ...cleaned }];
  return { ...submission, answers: next, updatedAtMs: nowMs() };
}

export function markSubmitted(submission: CheckinSubmission): CheckinSubmission {
  return { ...submission, submittedAtMs: nowMs(), updatedAtMs: nowMs() };
}
