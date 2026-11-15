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

// ── Due and missed ────────────────────────────────────────────────────────────

/** When period `index` closes: its check-in can be filled in any time before then. */
export function periodDueMs(s: CheckinSchedule, index: number): number {
  return periodStartMs(s, index + 1);
}

/** The latest closed period with nothing submitted for it, or null. Only the period just
 * before the current one counts: older gaps are history, not something to chase. Manual
 * and archived schedules are never missed. */
export function missedCheckin(
  s: CheckinSchedule,
  submissions: CheckinSubmission[],
  atMs: number = nowMs(),
): { periodIndex: number; dueMs: number } | null {
  if (s.archived) return null;
  const current = currentPeriodIndex(s, atMs);
  if (current === null || current < 1) return null;
  const previous = current - 1;
  const done = submissions.some(
    (x) => x.scheduleId === s.id && x.periodIndex === previous && x.submittedAtMs !== undefined,
  );
  return done ? null : { periodIndex: previous, dueMs: periodDueMs(s, previous) };
}

// ── The client's list: this period and earlier ones ─────────────────────────────

/** A coach's review of a submission, as the client sees it. */
export type CheckinReviewInfo = { reviewedAtMs: number; reply?: string | null; coachId?: string };

export type CheckinRowState = "due" | "draft" | "late" | "sent" | "reviewed" | "not-sent";

export type CheckinRow = {
  schedule: CheckinSchedule;
  periodIndex: number;
  periodStartMs: number;
  /** When it closes (0 for a manual form). */
  dueMs: number;
  state: CheckinRowState;
  submission?: CheckinSubmission;
  review?: CheckinReviewInfo;
};

function rowFor(
  s: CheckinSchedule,
  periodIndex: number,
  submissions: CheckinSubmission[],
  reviews: ReadonlyMap<string, CheckinReviewInfo>,
  open: "due" | "late" | "not-sent",
): CheckinRow {
  const submission = submissions.find((x) => x.scheduleId === s.id && x.periodIndex === periodIndex);
  const review = submission ? reviews.get(submission.id) : undefined;
  const state: CheckinRowState = submission?.submittedAtMs !== undefined
    ? review ? "reviewed" : "sent"
    // A late one stays "late" with a draft (the row still has the submission to say so).
    : submission && open === "due" ? "draft" : open;
  return {
    schedule: s,
    periodIndex,
    periodStartMs: submission?.periodStartMs ?? periodStartMs(s, periodIndex),
    dueMs: cadenceMs(s.cadence) === 0 ? 0 : periodDueMs(s, periodIndex),
    state,
    ...(submission ? { submission } : {}),
    ...(review ? { review } : {}),
  };
}

/**
 * The client's check-ins screen. `current`: each form's open period (a missed one first,
 * then this one), sent or not. `earlier`: everything before, newest first: what was sent
 * (with the coach's review) and the periods that weren't, back `periodsBack` periods.
 * Archived forms only show what was sent.
 */
export function checkinRows(
  schedules: CheckinSchedule[],
  submissions: CheckinSubmission[],
  reviews: ReadonlyMap<string, CheckinReviewInfo>,
  atMs: number = nowMs(),
  periodsBack = 8,
): { current: CheckinRow[]; earlier: CheckinRow[] } {
  const current: CheckinRow[] = [];
  const earlier: CheckinRow[] = [];
  const shown = new Set<string>();
  const key = (scheduleId: string, period: number) => `${scheduleId}#${period}`;

  for (const s of schedules) {
    const now = currentPeriodIndex(s, atMs);
    if (!s.archived) {
      const missed = missedCheckin(s, submissions, atMs);
      if (missed) {
        current.push(rowFor(s, missed.periodIndex, submissions, reviews, "late"));
        shown.add(key(s.id, missed.periodIndex));
      }
      const thisPeriod = now ?? 0;
      current.push(rowFor(s, thisPeriod, submissions, reviews, "due"));
      shown.add(key(s.id, thisPeriod));
      if (now !== null) {
        for (let p = Math.max(0, now - periodsBack); p < now; p++) {
          if (shown.has(key(s.id, p))) continue;
          earlier.push(rowFor(s, p, submissions, reviews, "not-sent"));
          shown.add(key(s.id, p));
        }
      }
    }
    // Anything else that was sent, however old.
    for (const sub of submissions) {
      if (sub.scheduleId !== s.id || sub.submittedAtMs === undefined || shown.has(key(s.id, sub.periodIndex))) continue;
      earlier.push(rowFor(s, sub.periodIndex, submissions, reviews, "not-sent"));
      shown.add(key(s.id, sub.periodIndex));
    }
  }
  earlier.sort((a, b) => b.periodStartMs - a.periodStartMs);
  return { current, earlier };
}

/** "Week of Nov 2", "Month of Oct 5", or the form's name for a manual one. */
export function checkinPeriodLabel(row: Pick<CheckinRow, "schedule" | "periodStartMs">, formatDate: (ms: number) => string): string {
  switch (row.schedule.cadence) {
    case "weekly":
    case "biweekly":
      return `Week of ${formatDate(row.periodStartMs)}`;
    case "monthly":
      return `Month of ${formatDate(row.periodStartMs)}`;
    case "manual":
      return row.schedule.name;
  }
}
