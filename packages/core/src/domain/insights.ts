import type { ProgressStatus } from "./progression";
import type { WeekResult, WeeklyStreak } from "./weeklyStreak";
import type { GoalView } from "./goalView";
import type { DiaryDay, GoalType } from "./nutrition";
import { dayTotals } from "./nutrition";
import type { WeightTrend } from "../nutrition/trend";
import { calorieAdherenceScore } from "../nutrition/adherence";
import { isoToUtcMs } from "./dateIso";

/**
 * Insights: plain answers to a fixed set of questions about your own data ("Which lifts
 * are moving?", "Is my training balanced?" ...). Pure: each platform loads the data its own
 * way (the phone from its local repos, the dashboard from sync) and builds the answers here,
 * so the phone, the web and a coach's view of a client always say the same thing.
 */

export type InsightRange = "4w" | "12w" | "6m" | "1y";

export const INSIGHT_RANGES: { id: InsightRange; label: string; days: number }[] = [
  { id: "4w", label: "4 weeks", days: 28 },
  { id: "12w", label: "12 weeks", days: 84 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "1y", label: "1 year", days: 365 },
];

export const DEFAULT_INSIGHT_RANGE: InsightRange = "12w";

const DAY_MS = 86_400_000;

export function isInsightRange(v: unknown): v is InsightRange {
  return INSIGHT_RANGES.some((r) => r.id === v);
}

export function rangeDays(range: InsightRange): number {
  return INSIGHT_RANGES.find((r) => r.id === range)!.days;
}

export function rangeStartMs(range: InsightRange, nowMs: number): number {
  return nowMs - rangeDays(range) * DAY_MS;
}

export type QuestionId = "lifts" | "balance" | "showing-up" | "eating" | "food-vs-lifts" | "goals";

/** What a question reads. A coach sees a question only when the client shares all of it. */
export type InsightArea = "training" | "nutrition" | "weight" | "habits";

export const QUESTIONS: { id: QuestionId; question: string; needs: InsightArea[] }[] = [
  { id: "lifts", question: "Which lifts are moving?", needs: ["training"] },
  { id: "balance", question: "Is my training balanced?", needs: ["training"] },
  { id: "showing-up", question: "Am I showing up?", needs: ["training"] },
  { id: "eating", question: "Is my eating on track?", needs: ["nutrition", "weight"] },
  { id: "food-vs-lifts", question: "Does food affect my lifts?", needs: ["training", "nutrition"] },
  { id: "goals", question: "When will I hit my goals?", needs: ["training"] },
];

export function isQuestionId(v: unknown): v is QuestionId {
  return QUESTIONS.some((q) => q.id === v);
}

export function questionText(id: QuestionId): string {
  return QUESTIONS.find((q) => q.id === id)!.question;
}

export type Tone = "up" | "flat" | "down";

export type InsightMini =
  | { kind: "chips"; chips: { label: string; tone: Tone }[] }
  | { kind: "bars"; bars: { label: string; value: number; low: boolean }[] }
  | { kind: "line"; values: number[] }
  | { kind: "weeks"; weeks: WeekResult["outcome"][] }
  | { kind: "rows"; rows: { label: string; value: string }[] };

export type InsightAnswer = {
  id: QuestionId;
  question: string;
  /** ready: there's an answer. empty: not enough data (answer says what's missing).
   * locked: a coach's view, and the client doesn't share what this needs. */
  state: "ready" | "empty" | "locked";
  answer: string;
  detail: string;
  mini?: InsightMini;
  /** A pattern in the data, not a measured effect (food vs lifts). */
  hypothesis?: boolean;
};

function answer(id: QuestionId, rest: Omit<InsightAnswer, "id" | "question">): InsightAnswer {
  return { id, question: questionText(id), ...rest };
}

export function lockedAnswer(id: QuestionId, detail: string): InsightAnswer {
  return answer(id, { state: "locked", answer: "Not shared", detail });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

// ── Which lifts are moving? ─────────────────────────────────────────────────

/** The fields of an ExerciseProgressStory this needs (kept narrow so it's easy to test). */
export type LiftStory = {
  exerciseName: string;
  status: ProgressStatus;
  statusDetail: string;
  lastTrainedMs: number;
};

const LIFT_TONE: Partial<Record<ProgressStatus, Tone>> = { progressing: "up", plateaued: "flat", regressing: "down" };

export function liftsAnswer(stories: LiftStory[], opts: { startMs: number }): InsightAnswer {
  const active = stories
    .filter((s) => s.lastTrainedMs >= opts.startMs && LIFT_TONE[s.status])
    .sort((a, b) => b.lastTrainedMs - a.lastTrainedMs);
  if (active.length === 0) {
    return answer("lifts", {
      state: "empty",
      answer: "Not enough sessions yet",
      detail: "A lift gets a trend after 3 sessions. Lifts you haven't trained in this range are left out.",
    });
  }
  const moving = active.filter((s) => s.status === "progressing");
  const stuck = active.filter((s) => s.status === "plateaued");
  const slipping = active.filter((s) => s.status === "regressing");

  const parts: string[] = [];
  if (moving.length) parts.push(`${moving.length} moving`);
  if (stuck.length) parts.push(`${stuck.length} stuck`);
  if (slipping.length) parts.push(`${slipping.length} slipping`);
  const text =
    moving.length === active.length
      ? active.length === 1 ? `${active[0]!.exerciseName} is moving` : `All ${active.length} lifts moving`
      : parts.join(", ");

  const attention = [...slipping, ...stuck].slice(0, 2);
  const detail = attention.length
    ? attention.map((s) => `${s.exerciseName}: ${lowerFirst(s.statusDetail)}.`).join(" ")
    : "Everything you trained in this range is going up.";

  const chips = [...moving, ...stuck, ...slipping]
    .slice(0, 6)
    .map((s) => ({ label: s.exerciseName, tone: LIFT_TONE[s.status]! }));

  return answer("lifts", { state: "ready", answer: text, detail, mini: { kind: "chips", chips } });
}

// ── Is my training balanced? ────────────────────────────────────────────────

/** The fields of a MuscleGroupInsight this needs. */
export type MuscleWeeks = {
  muscleGroup: string;
  status: ProgressStatus;
  contributingExercises: { exerciseName: string; status: ProgressStatus }[];
  weeks: { weekBucket: number; weightedSets: number; sessionCount: number }[];
};

export type MuscleBalanceRow = {
  muscleGroup: string;
  label: string;
  setsPerWeek: number;
  daysPerWeek: number;
  status: ProgressStatus;
  lifts: { exerciseName: string; status: ProgressStatus }[];
  low: boolean;
};

/**
 * Sets and days per muscle, averaged over the whole weeks in the range (weeks you didn't
 * train count as 0, so a muscle trained once a month doesn't look like it gets 12 a week).
 * `low` marks muscles getting under 60% of the median muscle, and under 8 a week.
 */
export function muscleBalance(
  insights: MuscleWeeks[],
  opts: { startBucket: number; currentBucket: number },
): MuscleBalanceRow[] {
  const from = opts.startBucket;
  const to = Math.max(from, opts.currentBucket - 1);
  const weekCount = to - from + 1;
  const rows = insights
    .map((g) => {
      const inRange = g.weeks.filter((w) => w.weekBucket >= from && w.weekBucket <= to);
      const sets = inRange.reduce((s, w) => s + w.weightedSets, 0) / weekCount;
      const days = inRange.reduce((s, w) => s + w.sessionCount, 0) / weekCount;
      return {
        muscleGroup: g.muscleGroup,
        label: capitalize(g.muscleGroup),
        setsPerWeek: round1(sets),
        daysPerWeek: round1(days),
        status: g.status,
        lifts: g.contributingExercises.map((c) => ({ exerciseName: c.exerciseName, status: c.status })),
        low: false,
      };
    })
    .filter((r) => r.setsPerWeek > 0)
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek);
  if (rows.length >= 3) {
    const sorted = rows.map((r) => r.setsPerWeek).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    for (const r of rows) r.low = r.setsPerWeek < median * 0.6 && r.setsPerWeek < 8;
  }
  return rows;
}

export function balanceAnswer(rows: MuscleBalanceRow[], opts: { anyTagged: boolean }): InsightAnswer {
  if (rows.length === 0) {
    return answer("balance", {
      state: "empty",
      answer: opts.anyTagged ? "No sets in this range" : "Tag your exercises' muscles",
      detail: opts.anyTagged
        ? "Train in this range and it'll show sets per muscle."
        : "Open an exercise in Library and pick the muscles it works. Then this shows sets per muscle.",
    });
  }
  const low = rows.filter((r) => r.low);
  const rest = rows.filter((r) => !r.low);
  const fmt = (n: number) => String(Math.round(n));
  let text: string;
  let detail: string;
  if (low.length === 0 && rows[0]!.setsPerWeek < 10) {
    text = "Every muscle gets under 10 sets a week";
    detail = `Between ${fmt(rows[rows.length - 1]!.setsPerWeek)} and ${fmt(rows[0]!.setsPerWeek)} working sets a week per muscle. 10 to 20 is a common range for growth.`;
  } else if (low.length === 0) {
    text = "No muscle is far behind";
    detail = `Between ${fmt(rows[rows.length - 1]!.setsPerWeek)} and ${fmt(rows[0]!.setsPerWeek)} working sets a week per muscle.`;
  } else {
    const names = low.map((r, i) => (i === 0 ? r.label : r.muscleGroup));
    text = low.length <= 2 ? `${listWords(names)} get${low.length === 1 ? "s" : ""} far less than the rest` : "Several muscles get far less than the rest";
    const lowText = listWords(low.slice(0, 3).map((r, i) => `${i === 0 ? r.label : r.muscleGroup} ${fmt(r.setsPerWeek)}`));
    const restRange = rest.length
      ? ` Everything else is ${fmt(rest[rest.length - 1]!.setsPerWeek)} to ${fmt(rest[0]!.setsPerWeek)}.`
      : "";
    detail = `${lowText} working sets a week.${restRange}`;
  }
  return answer("balance", {
    state: "ready",
    answer: text,
    detail,
    mini: { kind: "bars", bars: rows.slice(0, 10).map((r) => ({ label: r.label, value: r.setsPerWeek, low: r.low })) },
  });
}

// ── Am I showing up? ────────────────────────────────────────────────────────

export function showingUpAnswer(weeks: WeekResult[], streak: WeeklyStreak): InsightAnswer {
  const judged = weeks.filter((w) => w.outcome === "met" || w.outcome === "missed");
  const trained = weeks.reduce((s, w) => s + w.done, 0);
  if (trained === 0) {
    return answer("showing-up", {
      state: "empty",
      answer: "No workouts in this range",
      detail: `Your target is ${streak.weeklyTarget} days a week.`,
      mini: { kind: "weeks", weeks: weeks.map((w) => w.outcome) },
    });
  }
  const basis = judged.length ? judged : weeks;
  const perWeek = round1(basis.reduce((s, w) => s + w.done, 0) / basis.length);
  const met = judged.filter((w) => w.outcome === "met").length;
  const streakText = streak.currentWeeks > 1 ? ` ${streak.currentWeeks} in a row now.` : "";
  const detail = judged.length
    ? `${met} of ${judged.length} weeks on target.${streakText}`
    : "This is the first week in the range.";
  return answer("showing-up", {
    state: "ready",
    answer: `${perWeek} training days a week, target ${streak.weeklyTarget}`,
    detail,
    mini: { kind: "weeks", weeks: weeks.map((w) => w.outcome) },
  });
}

// ── Is my eating on track? ──────────────────────────────────────────────────

export type EatingSummary = {
  loggedDays: number;
  avgKcal: number | null;
  avgProteinG: number | null;
  /** 0–100, null without a calorie target. */
  adherencePct: number | null;
  /** Smoothed weight over the range, oldest first. */
  weightPoints: { dateIso: string; kg: number }[];
  /** kg a week over the range, from the smoothed trend. null with under 2 weeks of weigh-ins. */
  weeklyRateKg: number | null;
  goalType: GoalType | null;
  targetRateKg: number | null;
};

export function eatingSummary(input: {
  days: DiaryDay[];
  trend: WeightTrend | null;
  targetKcal: number | null;
  goalType: GoalType | null;
  targetRateKg?: number | null;
  startIso: string;
  endIso: string;
}): EatingSummary {
  const logged = input.days
    .filter((d) => !d.deletedAtMs && d.dateIso >= input.startIso && d.dateIso <= input.endIso)
    .map((d) => dayTotals(d))
    .filter((t) => t.kcal > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const points = (input.trend?.points ?? [])
    .filter((p) => p.dateIso >= input.startIso && p.dateIso <= input.endIso)
    .map((p) => ({ dateIso: p.dateIso, kg: Math.round(p.smoothedKg * 100) / 100 }));
  let weeklyRateKg: number | null = null;
  if (points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const days = (isoToUtcMs(last.dateIso) - isoToUtcMs(first.dateIso)) / DAY_MS;
    if (days >= 14) weeklyRateKg = Math.round(((last.kg - first.kg) / days) * 7 * 100) / 100;
  }
  return {
    loggedDays: logged.length,
    avgKcal: avg(logged.map((t) => t.kcal)),
    avgProteinG: avg(logged.map((t) => t.proteinG)),
    adherencePct: input.targetKcal
      ? calorieAdherenceScore(logged.map((t) => ({ consumedKcal: t.kcal, targetKcal: input.targetKcal! })))
      : null,
    weightPoints: points,
    weeklyRateKg,
    goalType: input.goalType,
    targetRateKg: input.targetRateKg ?? null,
  };
}

const GOAL_WORD: Record<GoalType, string> = { lose: "losing weight", gain: "gaining", maintain: "holding steady" };

export function eatingAnswer(s: EatingSummary): InsightAnswer {
  if (s.loggedDays === 0 && s.weeklyRateKg == null) {
    return answer("eating", {
      state: "empty",
      answer: "Nothing logged in this range",
      detail: "Log food and weigh in on the phone and this shows your averages and weight trend.",
    });
  }
  let text: string;
  if (s.weeklyRateKg == null) text = `${fmtNumber(s.avgKcal ?? 0)} kcal a day on average`;
  else if (Math.abs(s.weeklyRateKg) < 0.05) text = "Weight holding steady";
  else text = `${s.weeklyRateKg > 0 ? "Gaining" : "Losing"} ${Math.abs(s.weeklyRateKg).toFixed(2)} kg a week`;

  const bits: string[] = [];
  if (s.goalType) {
    const rate = s.targetRateKg && s.goalType !== "maintain" ? ` (${s.targetRateKg} kg a week)` : "";
    bits.push(`Goal is ${GOAL_WORD[s.goalType]}${rate}.`);
  }
  if (s.loggedDays > 0) {
    const parts = [`${fmtNumber(s.avgKcal!)} kcal on average`];
    if (s.adherencePct != null) parts.push(`${s.adherencePct}% on target`);
    parts.push(`${Math.round(s.avgProteinG!)} g protein`);
    bits.push(`${capitalize(parts.join(", "))}, over ${s.loggedDays} logged day${s.loggedDays === 1 ? "" : "s"}.`);
  } else {
    bits.push("No food logged in this range.");
  }
  if (s.weeklyRateKg == null) bits.push("Weigh in a few times a week to see the trend.");

  return answer("eating", {
    state: "ready",
    answer: text,
    detail: bits.join(" "),
    mini: s.weightPoints.length >= 2 ? { kind: "line", values: s.weightPoints.map((p) => p.kg) } : undefined,
  });
}

// ── Does food affect my lifts? ──────────────────────────────────────────────

/** The fields of a NutritionTrainingCorrelationResult this needs. */
export type FoodVsLifts = {
  dayLevelProtein?: {
    thresholdProteinG: number;
    above: { sampleCount: number; improveRate: number };
    below: { sampleCount: number; improveRate: number };
  };
  dayLevelReasoning: { inputs: Record<string, number | string | boolean>; confidence: "low" | "medium" | "high" };
};

/** Sessions the correlation needs before it says anything (nutritionTrainingCorrelation.ts). */
export const FOOD_VS_LIFTS_MIN_SESSIONS = 20;
/** Training days each side of the protein split needs (MIN_SAMPLES_PER_BUCKET there). */
export const FOOD_VS_LIFTS_MIN_BUCKET = 6;

export function foodVsLiftsAnswer(r: FoodVsLifts): InsightAnswer {
  const p = r.dayLevelProtein;
  if (!p) {
    const inputs = r.dayLevelReasoning.inputs;
    const sessions = Number(inputs.totalSessionSamples ?? inputs.sessionsWithASample ?? 0);
    const withFood = Number(inputs.sessionsWithLoggedProtein ?? 0);
    const above = Number(inputs.daySamplesAbove ?? 0);
    const below = Number(inputs.daySamplesBelow ?? 0);
    if (sessions < FOOD_VS_LIFTS_MIN_SESSIONS) {
      return answer("food-vs-lifts", { state: "empty", answer: "Too early to say", detail: `Needs ${FOOD_VS_LIFTS_MIN_SESSIONS} workouts to compare. You have ${sessions} so far.`, hypothesis: true });
    }
    if (withFood < FOOD_VS_LIFTS_MIN_SESSIONS) {
      return answer("food-vs-lifts", { state: "empty", answer: "Too early to say", detail: `Needs food logged on ${FOOD_VS_LIFTS_MIN_SESSIONS} training days. You have ${withFood} so far.`, hypothesis: true });
    }
    if (Math.min(above, below) < FOOD_VS_LIFTS_MIN_BUCKET) {
      return answer("food-vs-lifts", { state: "empty", answer: "Too early to say", detail: "Protein has been about the same most days, so there's nothing to compare yet.", hypothesis: true });
    }
    return answer("food-vs-lifts", {
      state: "ready",
      answer: "No clear difference so far",
      detail: `Across ${withFood} training days with food logged, workouts went about as well on higher-protein days as on lower ones.`,
      hypothesis: true,
    });
  }
  const abovePct = Math.round(p.above.improveRate * 100);
  const belowPct = Math.round(p.below.improveRate * 100);
  const diff = abovePct - belowPct;
  const text =
    Math.abs(diff) < 10
      ? "No clear difference so far"
      : diff > 0
        ? "Workouts went better on higher-protein days"
        : "Workouts went better on lower-protein days";
  const lowConfidence = r.dayLevelReasoning.confidence === "low" ? " Few days so far, so treat it lightly." : "";
  return answer("food-vs-lifts", {
    state: "ready",
    answer: text,
    detail: `Volume went up on ${abovePct}% of workouts on days with ${p.thresholdProteinG} g protein or more, and ${belowPct}% below that.${lowConfidence}`,
    hypothesis: true,
  });
}

// ── When will I hit my goals? ───────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "24 Jan" when it's under 3 months away, else "March" (plus the year when it isn't next). */
export function aroundDate(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const now = new Date(nowMs);
  if (ms - nowMs < 90 * DAY_MS) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const sameOrNextYear = d.getFullYear() === now.getFullYear() || (d.getFullYear() === now.getFullYear() + 1 && d.getMonth() < now.getMonth());
  return sameOrNextYear ? MONTHS_LONG[d.getMonth()]! : `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function goalLine(v: GoalView, nowMs: number): string {
  if (v.achievedAtMs != null) return "done";
  const p = v.projection;
  if (p.status === "ready") return "ready, do the set";
  if (p.status === "on_track" && p.eta) return `around ${aroundDate(p.eta.likelyMs, nowMs)}`;
  if (p.status === "stalled") return "stalled lately";
  return "not enough data yet";
}

export function goalsAnswer(views: GoalView[], nowMs: number): InsightAnswer {
  if (views.length === 0) {
    return answer("goals", { state: "empty", answer: "No goals set", detail: "Add one under Habits & goals and this works out when you'll get there." });
  }
  const open = views.filter((v) => v.achievedAtMs == null);
  const dated = open
    .filter((v) => v.projection.status === "on_track" && v.projection.eta)
    .sort((a, b) => a.projection.eta!.likelyMs - b.projection.eta!.likelyMs);
  const rows = views.map((v) => ({ label: v.title, value: goalLine(v, nowMs) }));
  if (open.length === 0) {
    return answer("goals", { state: "ready", answer: "All your goals are done", detail: "Time to set the next one.", mini: { kind: "rows", rows } });
  }
  const lead = dated[0];
  const text = lead ? `${lead.title} around ${aroundDate(lead.projection.eta!.likelyMs, nowMs)}` : "Not on pace for any goal yet";
  return answer("goals", {
    state: "ready",
    answer: text,
    detail: lead ? "From your pace lately." : "Your goals are stalled or need more sessions logged.",
    mini: { kind: "rows", rows: rows.filter((r) => !lead || r.label !== lead.title).slice(0, 3) },
  });
}
