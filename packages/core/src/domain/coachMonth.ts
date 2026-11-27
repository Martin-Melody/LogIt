// Your month and the cards on Today and Your month (canvas W5, W13): what each page can show,
// the standard layouts, your clients' wins and who's worth a look. Plain numbers from what each
// client shares; nothing here is sent to clients.

import { currentPeriodIndex, periodDueMs, type CheckinSchedule } from "./Checkin";
import { exerciseIndex } from "./exerciseIndex";
import type { WorkoutSession } from "./workout";

const DAY = 86_400_000;

export type PageId = "today" | "month";
export type PageCardId = "needs" | "ahead" | "week" | "lastweek" | "paid" | "clients" | "wins" | "worth";

/** Every card Today and Your month can show (canvas W13). Needs you is always first on Today. */
export const PAGE_CARDS: { id: PageCardId; name: string; hint: string; pages: PageId[]; fixed?: boolean }[] = [
  { id: "needs", name: "Needs you", hint: "Always first, can't be removed", pages: ["today"], fixed: true },
  { id: "ahead", name: "The week ahead", hint: "Programs ending, check-ins due, payments", pages: ["today", "month"] },
  { id: "week", name: "This week", hint: "Each client's sessions", pages: ["today"] },
  { id: "lastweek", name: "Last week", hint: "Sessions, check-ins, food", pages: ["today", "month"] },
  { id: "paid", name: "Paid to you", hint: "Six months through LogIt", pages: ["today", "month"] },
  { id: "clients", name: "Clients", hint: "Spots, joined, left", pages: ["today", "month"] },
  { id: "wins", name: "Your clients' wins", hint: "Records, sessions, check-ins", pages: ["today", "month"] },
  { id: "worth", name: "Worth a look", hint: "Clients who've changed", pages: ["today", "month"] },
];
export const STANDARD_LAYOUT: Record<PageId, PageCardId[]> = { today: ["needs", "ahead", "week"], month: ["paid", "clients", "wins", "worth"] };

/** A card from a card pack plugin: "plugin:<pluginId>:<cardId>" (canvas W13). */
export type PluginCardId = `plugin:${string}`;
export type PageCard = PageCardId | PluginCardId;

/** The cards a page shows: yours, or the standard ones. Unknown ids drop out (card pack cards
 * stay; the page skips one whose plugin is gone); Needs you stays first. */
export function pageCards(saved: string[] | null | undefined, page: PageId): PageCard[] {
  const known = (saved ?? STANDARD_LAYOUT[page]).filter((id): id is PageCard => id.startsWith("plugin:") || PAGE_CARDS.some((c) => c.id === id && c.pages.includes(page)));
  return page === "today" ? ["needs", ...known.filter((id) => id !== "needs")] : known;
}

// ── Your clients' wins ─────────────────────────────────────────────────────

export type ClientMonth = {
  id: string;
  name: string;
  /** Their finished workouts (empty when they don't share them). */
  sessions: WorkoutSession[] | null;
  daysPerWeek: number | null;
  /** Check-ins they sent in the month, and how many of those you've reviewed. */
  checkinsSent: number;
  checkinsReviewed: number;
  /** Check-ins due in the month (repeating forms only). */
  checkinsDue: number;
  /** Their program from you ended in the month. */
  finishedBlock: boolean;
};

export type Wins = {
  records: number;
  sessions: { done: number; planned: number } | null;
  checkins: { sent: number; due: number; reviewedAll: boolean } | null;
  highlights: string[];
};

const first = (n: string) => n.split(" ")[0] || n;

/** Records: lifts whose best in [from, to) beats everything before. */
export function recordsIn(sessions: WorkoutSession[], fromMs: number, toMs: number): { name: string; weight: number; reps: number }[] {
  const done = sessions.filter((s) => s.endedAtMs != null);
  const before = new Map(exerciseIndex(done.filter((s) => s.startedAtMs < fromMs)).map((h) => [h.id, h.e1rm]));
  return exerciseIndex(done.filter((s) => s.startedAtMs >= fromMs && s.startedAtMs < toMs))
    .filter((h) => h.e1rm > 0 && (before.get(h.id) ?? Infinity) < h.e1rm)
    .map((h) => ({ name: h.name, weight: h.weight, reps: h.reps }));
}

export function monthWins(clients: ClientMonth[], fromMs: number, toMs: number): Wins {
  const days = Math.max(1, Math.round((Math.min(toMs, Date.now()) - fromMs) / DAY));
  let records = 0, done = 0, planned = 0, sent = 0, due = 0, reviewed = 0;
  const highlights: { n: number; text: string }[] = [];
  const sharing = clients.filter((c) => c.sessions);
  for (const c of clients) {
    sent += c.checkinsSent; due += c.checkinsDue; reviewed += c.checkinsReviewed;
    if (c.finishedBlock) highlights.push({ n: 50, text: `${first(c.name)} finished a block.` });
    if (!c.sessions) continue;
    const inMonth = c.sessions.filter((s) => s.endedAtMs != null && s.startedAtMs >= fromMs && s.startedAtMs < toMs).length;
    done += inMonth;
    if (c.daysPerWeek) planned += Math.round((c.daysPerWeek * days) / 7);
    const r = recordsIn(c.sessions, fromMs, toMs);
    records += r.length;
    if (r.length) highlights.push({ n: r.length, text: `${first(c.name)}: ${r.length} record${r.length === 1 ? "" : "s"} (${r.slice(0, 2).map((x) => `${x.name.toLowerCase()} ${x.weight} × ${x.reps}`).join(", ")}).` });
  }
  return {
    records,
    sessions: sharing.length ? { done, planned } : null,
    checkins: due || sent ? { sent, due: Math.max(due, sent), reviewedAll: sent > 0 && reviewed >= sent } : null,
    highlights: highlights.sort((a, b) => b.n - a.n).slice(0, 2).map((h) => h.text),
  };
}

/** How many times a repeating form falls due in [from, to). */
export function dueIn(s: CheckinSchedule, fromMs: number, toMs: number): number {
  const last = currentPeriodIndex(s, toMs);
  if (last == null || s.archived) return 0;
  let n = 0;
  for (let i = Math.max(0, last - 40); i <= last; i++) {
    const at = periodDueMs(s, i);
    if (at >= fromMs && at < toMs && at >= s.anchorMs) n += 1;
  }
  return n;
}

// ── Worth a look ───────────────────────────────────────────────────────────

export type WorthALook = { id: string; relationshipId: string; name: string; reasons: string[] };

/** Clients whose last two weeks look different from the six before: training dropped off, plus
 * a late check-in or a failed payment for the same person. Only you see this. */
export function worthALook(
  clients: { id: string; relationshipId: string; name: string; sessions: WorkoutSession[] | null; lateDays: number | null; paymentProblem: string | null }[],
  now = Date.now(),
): WorthALook[] {
  const out: WorthALook[] = [];
  for (const c of clients) {
    const reasons: string[] = [];
    if (c.sessions) {
      const done = c.sessions.filter((s) => s.endedAtMs != null);
      const recent = done.filter((s) => s.startedAtMs >= now - 14 * DAY).length;
      const before = done.filter((s) => s.startedAtMs >= now - 56 * DAY && s.startedAtMs < now - 14 * DAY).length / 6;
      const last = Math.max(0, ...done.map((s) => s.startedAtMs));
      const quiet = last ? Math.floor((now - last) / DAY) : null;
      const was = `was ${Math.round(before)} a week`;
      if (before >= 1.5 && quiet != null && quiet >= 8) reasons.push(`no workouts for ${quiet} days (${was})`);
      else if (before >= 1.5 && recent / 2 <= before / 2) reasons.push(`${recent} session${recent === 1 ? "" : "s"} in 2 weeks (${was})`);
    }
    if (c.lateDays != null && c.lateDays >= 2) reasons.push(`check-in ${c.lateDays} days late`);
    if (c.paymentProblem) reasons.push(c.paymentProblem);
    if (reasons.length) out.push({ id: c.id, relationshipId: c.relationshipId, name: c.name, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length);
}
