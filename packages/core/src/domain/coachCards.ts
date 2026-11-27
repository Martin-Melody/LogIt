// The cards on a client's Overview (canvas K3, W4, W11): each one a WidgetView, the same
// vocabulary the phone's home cards and plugin widgets use, so the web draws them with the one
// renderer. Every card works over a period (This week, This month, This block) and only from
// what the client shares; a card for something they don't share isn't drawn (the picker says why).

import type { WidgetView, WidgetStat } from "../plugins/widgetView";
import { questionsFor, type AskedQuestion, type CheckinAnswer, type CheckinSchedule, type CheckinSubmission } from "./Checkin";
import { dayTotals, type DiaryDay, type WeightEntry } from "./nutrition";
import { dueOn, isSatisfied, type Habit, type HabitEntry } from "./habit";
import { addDays } from "./dateIso";
import { exerciseIndex } from "./exerciseIndex";
import { smoothWeightSeries } from "../nutrition/trend";
import type { WorkoutSession } from "./workout";

const DAY = 86_400_000;

export type ShareArea = "workouts" | "nutrition" | "bodyweight" | "habits" | "checkins";
export type CoachCardId = "checkin" | "training" | "body" | "food" | "habits" | "startup";

/** LogIt's cards, in the picker's order, with what each needs shared. */
export const COACH_CARDS: { id: CoachCardId; name: string; needs: ShareArea }[] = [
  { id: "checkin", name: "Latest check-in", needs: "checkins" },
  { id: "training", name: "Training: sessions, estimates, records", needs: "workouts" },
  { id: "body", name: "Body: weight, measurements, photos", needs: "bodyweight" },
  { id: "food", name: "Food against targets", needs: "nutrition" },
  { id: "habits", name: "Habits and check-ins", needs: "habits" },
  { id: "startup", name: "Start-up form", needs: "checkins" },
];
export const DEFAULT_CARDS: string[] = ["checkin", "training", "body", "food", "habits"];

/** Which cards to show: the client's own list, else their package's, else everyone's, else LogIt's. */
export type CardLayout = {
  all?: string[] | null; packages?: Record<string, string[]> | null; clients?: Record<string, string[]> | null;
  /** Canvas W13: Today's and Your month's own lists (null: the standard layout). */
  today?: string[] | null; month?: string[] | null;
};
export function cardsFor(layout: CardLayout | null, clientId: string, packageId?: string | null): { cards: string[]; from: "client" | "package" | "all" | "default" } {
  const own = layout?.clients?.[clientId];
  if (own) return { cards: own, from: "client" };
  const pkg = packageId ? layout?.packages?.[packageId] : undefined;
  if (pkg) return { cards: pkg, from: "package" };
  if (layout?.all) return { cards: layout.all, from: "all" };
  return { cards: DEFAULT_CARDS, from: "default" };
}

// ── Periods ─────────────────────────────────────────────────────────────────

export type CardPeriod = { kind: "week" | "month" | "block"; fromMs: number; toMs: number; label: string; days: number };

const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Calendar days from the day of fromMs to the day before toMs, both counted (DST-proof). */
const calendarDays = (fromMs: number, toMs: number) => Math.max(1, Math.round((startOfDay(toMs - 1) - startOfDay(fromMs)) / DAY) + 1);
const isoOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** This week (Monday on), a month (0 = this one, 1 = last…), or the running block. */
export function cardPeriod(kind: CardPeriod["kind"], now: number, opts: { monthsBack?: number; block?: { startMs: number; endMs: number | null; label: string } | null } = {}): CardPeriod {
  if (kind === "month") {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth() - (opts.monthsBack ?? 0), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() - (opts.monthsBack ?? 0) + 1, 1).getTime();
    const toMs = Math.min(end, now);
    const name = new Date(start).toLocaleDateString("en-GB", { month: "long", ...(new Date(start).getFullYear() !== d.getFullYear() ? { year: "numeric" } : {}) });
    return { kind, fromMs: start, toMs, label: name, days: calendarDays(start, toMs) };
  }
  if (kind === "block" && opts.block) {
    const toMs = Math.min(opts.block.endMs ?? now, now);
    return { kind, fromMs: startOfDay(opts.block.startMs), toMs, label: opts.block.label, days: calendarDays(opts.block.startMs, toMs) };
  }
  const today = startOfDay(now);
  const monday = today - ((new Date(today).getDay() + 6) % 7) * DAY;
  return { kind: "week", fromMs: monday, toMs: now, label: "This week", days: Math.round((today - monday) / DAY) + 1 };
}

// ── Input ───────────────────────────────────────────────────────────────────

export type CardCheckin = { id: string; submission: CheckinSubmission; schedule: CheckinSchedule | null; reviewed: boolean; clientId: string };
export type CoachCardInput = {
  now: number;
  period: CardPeriod;
  firstName: string;
  sharing: Record<ShareArea, boolean>;
  sessions?: WorkoutSession[];
  daysPerWeek?: number | null;
  weights?: WeightEntry[];
  diaryDays?: DiaryDay[];
  target?: { kcal: number; proteinG: number | null } | null;
  habits?: Habit[];
  habitEntries?: HabitEntry[];
  checkins?: CardCheckin[];
};

// ── Cards ───────────────────────────────────────────────────────────────────

const k = (n: number) => Math.round(n).toLocaleString("en-GB");
const kg = (n: number) => (Math.round(n * 10) / 10).toString();
const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${kg(Math.abs(n))}${unit}`;

/** A check-in answer as words ("Yes", "71.4 kg", "7 / 10", the text). */
export function answerText(q: Pick<AskedQuestion, "type"> & { scaleMax?: number }, a: CheckinAnswer | undefined): string {
  if (!a) return "–";
  switch (q.type) {
    case "boolean": return a.bool === undefined ? "–" : a.bool ? "Yes" : "No";
    case "weight": return a.number === undefined ? "–" : `${a.number} kg`;
    case "measurement": return a.number === undefined ? "–" : `${a.number} cm`;
    case "scale": return a.number === undefined ? "–" : `${a.number}/${q.scaleMax ?? 10}`;
    case "photo": { const n = (a.photoDataUrls ?? []).filter(Boolean).length + (a.photoDataUrl ? 1 : 0); return n ? `${n} photo${n === 1 ? "" : "s"}` : "No photos"; }
    case "choice": return a.choices?.length ? a.choices.join(", ") : (a.text || "–");
    default: return a.number === undefined ? (a.text?.trim() || "–") : String(a.number);
  }
}

/** Health questions answered "Yes" (canvas K3: shown in amber until the form is reviewed). */
export function healthYeses(c: CardCheckin): string[] {
  return questionsFor(c.submission, c.schedule)
    .filter((q) => q.type === "boolean" && /heart|chest pain|dizz|faint|blood pressure|pregnan|doctor/i.test(q.prompt))
    .filter((q) => c.submission.answers.find((a) => a.questionId === q.id)?.bool === true)
    .map((q) => q.prompt);
}

function notShared(title: string, name: string): WidgetView {
  return { title, body: [], empty: { text: `${name} doesn't share this with you.` } };
}

function checkinCard(i: CoachCardInput): WidgetView {
  const list = (i.checkins ?? []).filter((c) => c.schedule?.kind !== "startup" && c.submission.submittedAtMs);
  const latest = list.sort((a, b) => b.submission.submittedAtMs! - a.submission.submittedAtMs!)[0];
  if (!latest) return { title: "Latest check-in", body: [], empty: { text: "Nothing sent yet." } };
  const qs = questionsFor(latest.submission, latest.schedule);
  const get = (q: AskedQuestion) => latest.submission.answers.find((a) => a.questionId === q.id);
  const quote = qs.filter((q) => q.type === "text").map((q) => get(q)?.text?.trim()).filter(Boolean).slice(0, 2).join(" ");
  const scales = qs.filter((q) => q.type === "scale" || q.type === "weight").map((q) => `${q.prompt.replace(/\s*\(.*\)$/, "")} ${answerText(q, get(q))}`);
  return {
    title: latest.schedule?.name ?? "Check-in",
    subtitle: `Sent ${new Date(latest.submission.submittedAtMs!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${latest.reviewed ? " · reviewed" : ""}`,
    body: [
      ...(quote ? [{ kind: "text" as const, text: `“${quote.length > 220 ? `${quote.slice(0, 217)}…` : quote}”` }] : []),
      ...(scales.length ? [{ kind: "text" as const, text: scales.join(" · "), tone: "muted" as const }] : []),
      ...(!latest.reviewed ? [{ kind: "button-row" as const, buttons: [{ label: "Review", primary: true, action: { navigate: `/coaching/checkins?id=${encodeURIComponent(latest.id)}&client=${latest.clientId}` } }] }] : []),
    ],
  };
}

function startupCard(i: CoachCardInput): WidgetView {
  const form = (i.checkins ?? []).filter((c) => c.schedule?.kind === "startup" && c.submission.submittedAtMs).sort((a, b) => b.submission.submittedAtMs! - a.submission.submittedAtMs!)[0];
  if (!form) return { title: "Start-up form", body: [], empty: { text: "Not filled in yet." } };
  const qs = questionsFor(form.submission, form.schedule);
  return {
    title: "Start-up form",
    subtitle: `Sent ${new Date(form.submission.submittedAtMs!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    body: [{ kind: "list", items: qs.map((q) => ({ label: q.prompt, trailing: answerText(q, form.submission.answers.find((a) => a.questionId === q.id)) })) }],
  };
}

function trainingCard(i: CoachCardInput): WidgetView {
  const { fromMs, toMs, days } = i.period;
  const done = (i.sessions ?? []).filter((s) => s.endedAtMs != null);
  const inPeriod = done.filter((s) => s.startedAtMs >= fromMs && s.startedAtMs < toMs);
  const before = done.filter((s) => s.startedAtMs < fromMs);
  const now = exerciseIndex(inPeriod).filter((h) => h.e1rm > 0);
  const prior = new Map(exerciseIndex(before).map((h) => [h.id, h]));
  const planned = i.daysPerWeek ? Math.round((i.daysPerWeek * days) / 7) : null;
  const stats: WidgetStat[] = [{ label: "Sessions", value: planned ? `${inPeriod.length} of ${planned}` : String(inPeriod.length) }];
  // Estimates: the two heaviest lifts done both before and in the period.
  for (const h of now.filter((h) => prior.get(h.id)?.e1rm).sort((a, b) => b.e1rm - a.e1rm).slice(0, 2)) {
    const was = prior.get(h.id)!.e1rm;
    stats.push({ label: `${h.name} estimate`, value: `${kg(was)} → ${kg(h.e1rm)} kg`, sublabel: signed(h.e1rm - was) });
  }
  const records = now.filter((h) => { const p = prior.get(h.id); return !!p && p.e1rm > 0 && h.e1rm > p.e1rm; });
  stats.push({ label: "Records", value: String(records.length), sublabel: records.slice(0, 3).map((r) => `${r.name.toLowerCase()} ${kg(r.weight)} × ${r.reps}`).join(", ") || undefined });
  return { title: "Training", body: [{ kind: "stat-grid", stats }], action: { navigate: "?tab=training" } };
}

function bodyCard(i: CoachCardInput): WidgetView {
  const { fromMs, toMs } = i.period;
  const weights = i.weights ?? [];
  const at = (ms: number) => smoothWeightSeries(weights.filter((w) => w.dateIso <= isoOf(ms))).currentKg;
  const start = at(fromMs - DAY), end = at(toMs);
  const stats: WidgetStat[] = [];
  if (end != null) stats.push({ label: "Weight, 7-day average", value: start != null && i.period.kind !== "week" ? `${kg(start)} → ${kg(end)} kg` : `${kg(end)} kg`, sublabel: start != null ? signed(end - start, " kg") : undefined });
  // Measurements and photos from their check-ins in the period.
  const sent = (i.sharing.checkins ? i.checkins ?? [] : []).filter((c) => c.submission.submittedAtMs && c.submission.submittedAtMs >= fromMs - 35 * DAY && c.submission.submittedAtMs < toMs).sort((a, b) => a.submission.submittedAtMs! - b.submission.submittedAtMs!);
  const series = new Map<string, number[]>();
  let photos = 0;
  for (const c of sent) {
    for (const q of questionsFor(c.submission, c.schedule)) {
      const a = c.submission.answers.find((x) => x.questionId === q.id);
      if (q.type === "measurement" && a?.number != null) series.set(q.prompt, [...(series.get(q.prompt) ?? []), a.number]);
      if (q.type === "photo" && c.submission.submittedAtMs! >= fromMs) photos += (a?.photoDataUrls ?? []).filter(Boolean).length + (a?.photoDataUrl ? 1 : 0);
    }
  }
  for (const [name, vals] of series) stats.push({ label: name, value: vals.length > 1 ? `${kg(vals[0]!)} → ${kg(vals.at(-1)!)} cm` : `${kg(vals[0]!)} cm` });
  if (photos) stats.push({ label: "Progress photos", value: String(photos) });
  if (!stats.length) return { title: "Body", body: [], empty: { text: "No weigh-ins or measurements yet." } };
  return { title: "Body", body: [{ kind: "stat-grid", stats }] };
}

function foodCard(i: CoachCardInput): WidgetView {
  const logged = (i.diaryDays ?? []).filter((d) => d.items.length > 0);
  if (!logged.length) return { title: "Food", body: [], empty: { text: "Nothing logged in this period." } };
  const totals = logged.map(dayTotals);
  const avg = (f: (t: (typeof totals)[number]) => number) => totals.reduce((n, t) => n + f(t), 0) / totals.length;
  const t = i.target;
  const stats: WidgetStat[] = [
    { label: "Days logged", value: `${logged.length} of ${i.period.days}` },
    { label: "Calories, average", value: t ? `${k(avg((x) => x.kcal))} of ${k(t.kcal)}` : k(avg((x) => x.kcal)) },
    { label: "Protein, average", value: t?.proteinG ? `${k(avg((x) => x.proteinG))} of ${k(t.proteinG)} g` : `${k(avg((x) => x.proteinG))} g` },
  ];
  if (t?.kcal) stats.push({ label: "Days within 10% of calories", value: `${totals.filter((x) => Math.abs(x.kcal - t.kcal) <= t.kcal * 0.1).length} of ${logged.length}` });
  return { title: "Food", body: [{ kind: "stat-grid", stats }], action: { navigate: "?tab=nutrition" } };
}

function habitsCard(i: CoachCardInput): WidgetView {
  const { fromMs, toMs } = i.period;
  const fromIso = isoOf(fromMs), toIso = isoOf(toMs);
  const items = (i.sharing.habits ? i.habits ?? [] : []).map((h) => {
    let due = 0, done = 0;
    for (let d = fromIso; d <= toIso; d = addDays(d, 1)) {
      if (!dueOn(h, d)) continue;
      due += 1;
      if (isSatisfied(h, (i.habitEntries ?? []).find((e) => e.habitId === h.id && e.dateIso === d))) done += 1;
    }
    const weeks = Math.max(1, Math.round(i.period.days / 7));
    return { label: h.name, trailing: h.cadence.kind === "weekly" ? `${done} of ${h.cadence.timesPerWeek * weeks}` : `${done} of ${due} days` };
  });
  if (i.sharing.checkins) {
    const sent = (i.checkins ?? []).filter((c) => c.schedule?.kind !== "startup" && c.submission.submittedAtMs! >= fromMs && c.submission.submittedAtMs! < toMs);
    const scales = sent.flatMap((c) => questionsFor(c.submission, c.schedule).filter((q) => q.type === "scale").slice(0, 1).map((q) => ({ q, n: c.submission.answers.find((a) => a.questionId === q.id)?.number })).filter((x) => x.n != null));
    const avg = scales.length ? scales.reduce((n, x) => n + x.n!, 0) / scales.length : null;
    items.push({ label: "Check-ins", trailing: `${sent.length}${avg != null ? ` · ${scales[0]!.q.prompt.replace(/\s*\(.*\)$/, "").toLowerCase()} ${kg(avg)} average` : ""}` });
  }
  if (!items.length) return { title: "Habits and check-ins", body: [], empty: { text: "No habits from you yet." } };
  return { title: "Habits and check-ins", body: [{ kind: "list", items }], action: { navigate: "?tab=habits" } };
}

const CARD_TITLES: Record<CoachCardId, string> = { checkin: "Latest check-in", training: "Training", body: "Body", food: "Food", habits: "Habits and check-ins", startup: "Start-up form" };

/** One of LogIt's cards for this client and period. */
export function coachCard(id: CoachCardId, i: CoachCardInput): WidgetView {
  const need = COACH_CARDS.find((c) => c.id === id)!.needs;
  if (!i.sharing[need] && !(id === "habits" && i.sharing.checkins)) return notShared(CARD_TITLES[id], i.firstName);
  switch (id) {
    case "checkin": return checkinCard(i);
    case "startup": return startupCard(i);
    case "training": return trainingCard(i);
    case "body": return bodyCard(i);
    case "food": return foodCard(i);
    case "habits": return habitsCard(i);
  }
}
