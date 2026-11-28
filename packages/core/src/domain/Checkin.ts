import { createId } from "./ids";
import { nowMs } from "./time";

// Structured coach check-ins. A CheckinSchedule is authored by a coach and assigned to a
// client (coach→client, read-only for the client — same shape as CoachProgram). The
// client's answers are CheckinSubmission rows that sync back the normal client→coach
// direction (like workout sessions).

export type CheckinQuestionType =
  | "text" | "number" | "scale" | "weight" | "boolean" | "photo"
  // Forms overhaul (canvas F2): choose one or several, a measurement, and a heading.
  | "choice" | "measurement" | "heading";

/** Measurements a form can ask for; they save into the client's own history. */
export const MEASUREMENTS = ["waist", "hips", "chest", "arm", "thigh"] as const;
export type Measurement = (typeof MEASUREMENTS)[number];

export type CheckinCadence = "weekly" | "biweekly" | "monthly" | "manual";

export type CheckinQuestion = {
  id: string;
  prompt: string;
  type: CheckinQuestionType;
  required?: boolean;
  /** For "scale": the endpoints (default 1–10). */
  scaleMin?: number;
  scaleMax?: number;
  /** Shown under the question: how to measure, what to include. */
  help?: string;
  /** "text": a long answer box. */
  long?: boolean;
  /** "choice": the answers to pick from; `multi` = choose several. */
  options?: string[];
  multi?: boolean;
  /** "measurement": which one (in cm). */
  measure?: Measurement;
  /** "photo": one photo per pose, e.g. front, side, back (none = one photo). */
  poses?: string[];
};

/**
 * What a form is for (canvas F1): a check-in on a schedule, or the start-up form new clients
 * fill in once after taking a spot. Missing on older forms = "checkin".
 */
export type CheckinFormKind = "checkin" | "startup";

export type CheckinSchedule = {
  id: string;
  name: string;
  kind?: CheckinFormKind;
  /** A client's copy: the shared form it came from (a template's id). */
  sourceId?: string;
  /** A client's own version ("Change for Aoife only"): the shared form's changes skip it. */
  own?: boolean;
  /** A shared check-in form every new client gets when they take a spot (canvas J4). */
  autoStart?: boolean;
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
  /** "choice" with several picked. One pick is `text`. */
  choices?: string[];
  /** "photo" with poses: one per pose, in the question's order ("" = not taken). */
  photoDataUrls?: string[];
};

/** A question as it was when the answers were sent (the form may change later). */
export type AskedQuestion = Pick<CheckinQuestion, "id" | "prompt" | "type" | "measure" | "poses" | "options">;

export type CheckinSubmission = {
  id: string;
  scheduleId: string;
  /** 0-based occurrence index from the schedule anchor. */
  periodIndex: number;
  periodStartMs: number;
  answers: CheckinAnswer[];
  /** Set when the client submits; undefined while still a draft. */
  submittedAtMs?: number;
  /** The questions as they were asked, kept when it's sent (canvas F2). */
  asked?: AskedQuestion[];
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

/** Sends it; with the form, the questions are kept as they were asked. */
export function markSubmitted(submission: CheckinSubmission, schedule?: CheckinSchedule): CheckinSubmission {
  const asked = schedule?.questions
    .filter((q) => q.type !== "heading")
    .map(({ id, prompt, type, measure, poses, options }) => ({ id, prompt, type, ...(measure ? { measure } : {}), ...(poses ? { poses } : {}), ...(options ? { options } : {}) }));
  return { ...submission, submittedAtMs: nowMs(), updatedAtMs: nowMs(), ...(asked ? { asked } : {}) };
}

/** The questions to show next to a sent check-in: as asked, else the form as it is now. */
export function questionsFor(submission: CheckinSubmission, schedule: CheckinSchedule | null): AskedQuestion[] {
  return submission.asked ?? schedule?.questions.filter((q) => q.type !== "heading") ?? [];
}

/** Required questions not answered yet (headings ask nothing). */
export function missingAnswers(schedule: CheckinSchedule, submission: CheckinSubmission): CheckinQuestion[] {
  return schedule.questions.filter((q) => {
    if (!q.required || q.type === "heading") return false;
    const a = submission.answers.find((x) => x.questionId === q.id);
    if (!a) return true;
    if (q.type === "photo" && q.poses?.length) return !a.photoDataUrls?.some(Boolean);
    return a.text === undefined && a.number === undefined && a.bool === undefined && !a.photoDataUrl && !a.choices?.length;
  });
}

// ── Shared forms and clients' copies (canvas F1, K11, K15) ───────────────────────

/** A client's copy of a shared form: same questions, its own id and schedule. */
export function copyForClient(template: CheckinSchedule, cadence: CheckinCadence, anchorMs: number): CheckinSchedule {
  const now = nowMs();
  return {
    ...template,
    id: createId("ckin"),
    sourceId: template.id,
    own: false,
    autoStart: undefined,
    cadence: template.kind === "startup" ? "manual" : cadence,
    anchorMs,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/** A shared form changed: a copy that follows it takes its name and questions, keeping its own schedule. */
export function followTemplate(copy: CheckinSchedule, template: CheckinSchedule): CheckinSchedule {
  if (copy.own || copy.sourceId !== template.id) return copy;
  return touchCheckinSchedule({ ...copy, name: template.name, questions: template.questions });
}

/** "Change for Aoife only": the copy stops following the shared form. */
export function makeOwn(copy: CheckinSchedule): CheckinSchedule {
  return touchCheckinSchedule({ ...copy, own: true });
}

/** "Back to shared": the shared form's questions again, following it from now on. */
export function backToShared(copy: CheckinSchedule, template: CheckinSchedule): CheckinSchedule {
  return touchCheckinSchedule({ ...copy, own: false, sourceId: template.id, name: template.name, questions: template.questions });
}

/** LogIt's ready-made forms (canvas F1 "From LogIt"). */
export function readyMadeForm(which: "weekly" | "health" | "monthly" | "startup"): CheckinSchedule {
  const base = createCheckinSchedule();
  const q = (p: Omit<CheckinQuestion, "id">): CheckinQuestion => ({ ...p, id: createId("ckq") });
  const health: CheckinQuestion[] = [
    q({ prompt: "Has a doctor ever said you have a heart condition?", type: "boolean", required: true }),
    q({ prompt: "Chest pain or dizziness when you exercise?", type: "boolean", required: true }),
    q({ prompt: "Any medication your coach should know about?", type: "text" }),
    q({ prompt: "Injuries, now or in the past", type: "text", long: true }),
  ];
  switch (which) {
    case "weekly":
      return { ...base, name: "Weekly check-in" };
    case "health":
      return { ...base, name: "Health questions", cadence: "manual", questions: health };
    case "monthly":
      return {
        ...base, name: "Monthly review", cadence: "monthly",
        questions: [
          q({ prompt: "How did this month go?", type: "text", long: true, required: true }),
          q({ prompt: "Bodyweight", type: "weight" }),
          q({ prompt: "Waist", type: "measurement", measure: "waist", help: "At the belly button, relaxed, first thing in the morning" }),
          q({ prompt: "Progress photos", type: "photo", poses: ["Front", "Side", "Back"] }),
          q({ prompt: "What do you want to focus on next month?", type: "text" }),
        ],
      };
    case "startup":
      return {
        ...base, name: "Start-up form", kind: "startup", cadence: "manual",
        questions: [
          ...health.slice(0, 3),
          q({ prompt: "Body weight", type: "weight", required: true }),
          q({ prompt: "Waist", type: "measurement", measure: "waist", help: "At the belly button, relaxed, first thing in the morning" }),
          q({ prompt: "Progress photos", type: "photo", poses: ["Front", "Side", "Back"] }),
          q({ prompt: "Foods you don't eat", type: "choice", multi: true, options: ["Vegetarian", "Vegan", "Dairy-free", "Gluten-free", "Nut allergy"] }),
          q({ prompt: "When do you usually train?", type: "choice", options: ["Morning", "Lunch", "Evening"] }),
        ],
      };
  }
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
  /** The coach was away then (canvas Z7): a check-in due in that time isn't late. */
  excuse?: { fromMs: number; untilMs: number } | null,
): { periodIndex: number; dueMs: number } | null {
  if (s.archived) return null;
  const current = currentPeriodIndex(s, atMs);
  if (current === null || current < 1) return null;
  const previous = current - 1;
  const done = submissions.some(
    (x) => x.scheduleId === s.id && x.periodIndex === previous && x.submittedAtMs !== undefined,
  );
  if (done) return null;
  const dueMs = periodDueMs(s, previous);
  if (excuse && dueMs >= excuse.fromMs && dueMs < excuse.untilMs) return null;
  return { periodIndex: previous, dueMs };
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

/** Whether Home should ask for this check-in now. A recurring one is asked near the end of its
 * period (the last 2 days of a week, 3 of a fortnight, 5 of a month), so a new client's first
 * weekly check-in comes at the end of their first week, not the day they join. A draft, a late
 * one or a form sent by hand is asked straight away. It can still be filled in early from the
 * Check-ins page. */
export function asksNow(row: Pick<CheckinRow, "schedule" | "state" | "dueMs">, atMs: number = nowMs()): boolean {
  if (row.state === "draft" || row.state === "late") return true;
  if (row.state !== "due") return false;
  const lead = { weekly: 2, biweekly: 3, monthly: 5 }[row.schedule.cadence as "weekly"];
  if (!lead || row.dueMs == null) return true;
  return atMs >= row.dueMs - lead * 24 * 3600_000;
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
