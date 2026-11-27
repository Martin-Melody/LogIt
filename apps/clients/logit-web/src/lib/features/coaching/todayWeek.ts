// Today's right column (canvas W1): the week ahead (what's coming) and, on a Monday, how last
// week went, as plain numbers. Nothing here is sent to clients.

import { currentPeriodIndex, periodDueMs } from "@logit/core/domain/Checkin";
import type { PaymentClient } from "@logit/core/domain/coachPayments";
import type { CoachingOverview } from "./coachingData";

const DAY = 86_400_000;

export type AheadItem = { atMs: number; text: string; note?: string; href: string };

const first = (name: string) => name.split(" ")[0] || name;
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The next 7 days: programs ending, paid-until dates passing, payment rules acting, check-ins due (one line a day). */
export function weekAhead(o: CoachingOverview, payments: PaymentClient[], now = Date.now()): AheadItem[] {
  const end = startOfDay(now) + 8 * DAY;
  const soon = (ms: number) => ms > now && ms < end;
  const out: AheadItem[] = [];
  for (const c of o.clients) {
    const p = c.program;
    if (p?.state === "running" && p.endsAtMs != null && soon(p.endsAtMs)) out.push({ atMs: p.endsAtMs, text: `${first(c.name)}'s program ends`, href: `/clients/${c.id}/next-block` });
  }
  const shown = new Set(o.clients.map((c) => c.id));
  for (const pc of payments) {
    if (!shown.has(pc.client.id)) continue;
    const who = first(pc.client.displayName || pc.client.username);
    const paidUntil = pc.paidUntil ? Date.parse(pc.paidUntil) : NaN;
    if (pc.mode === "elsewhere" && soon(paidUntil)) out.push({ atMs: paidUntil, text: `${who}'s paid-until date passes`, note: "paid elsewhere", href: "/coaching/payments" });
    const acts = pc.actionAt ? Date.parse(pc.actionAt) : NaN;
    if (pc.state === "failed" && pc.rule !== "keep" && soon(acts)) out.push({ atMs: acts, text: `${who}'s coaching ${pc.rule === "end" ? "ends" : "pauses"} if still unpaid`, href: "/coaching/payments" });
  }
  // Check-ins due, counted per day.
  const byClient = new Map(o.clients.map((c) => [c.id, c]));
  const due = new Map<number, number>();
  for (const s of o.schedules) {
    const c = s.recipientUserId ? byClient.get(s.recipientUserId) : null;
    if (!c || s.schedule.archived || !c.sharing.checkins || (c.pausedUntil && Date.parse(c.pausedUntil) > now)) continue;
    const i = currentPeriodIndex(s.schedule, now);
    if (i == null) continue;
    for (const ms of [periodDueMs(s.schedule, i), periodDueMs(s.schedule, i + 1)]) {
      if (soon(ms)) due.set(startOfDay(ms), (due.get(startOfDay(ms)) ?? 0) + 1);
    }
  }
  for (const [day, n] of due) out.push({ atMs: day, text: `${n} check-in${n === 1 ? "" : "s"} due`, href: "/coaching/checkins" });
  return out.sort((a, b) => a.atMs - b.atMs);
}

export type LastWeek = {
  sessions: { done: number; planned: number } | null;
  checkins: { done: number; due: number } | null;
  food: { logged: number; sharing: number } | null;
  quiet: { id: string; name: string }[];
};

/** How the last 7 days went. Sessions and food only count clients who share them. */
export function lastWeek(o: CoachingOverview, now = Date.now()): LastWeek {
  const workouts = o.clients.filter((c) => c.sharing.workouts);
  const running = workouts.filter((c) => c.program?.state === "running");
  // Only repeating schedules are ever due (a start-up form isn't).
  const repeating = new Set(o.schedules.filter((s) => !s.schedule.archived && currentPeriodIndex(s.schedule, now) != null).map((s) => s.recipientUserId));
  const withCheckins = o.clients.filter((c) => c.sharing.checkins && repeating.has(c.id));
  const food = o.clients.filter((c) => c.foodDays7d != null);
  return {
    sessions: running.length ? { done: running.reduce((n, c) => n + Math.min(c.sessions7d, c.program!.daysPerWeek), 0), planned: running.reduce((n, c) => n + c.program!.daysPerWeek, 0) } : null,
    checkins: withCheckins.length ? { done: withCheckins.filter((c) => c.lastCheckinAtMs != null && now - c.lastCheckinAtMs <= 7 * DAY).length, due: withCheckins.length } : null,
    food: food.length ? { logged: food.filter((c) => c.foodDays7d! >= 5).length, sharing: food.length } : null,
    quiet: workouts.filter((c) => !c.lastSessionAtMs || now - c.lastSessionAtMs >= 7 * DAY).map((c) => ({ id: c.id, name: first(c.name) })),
  };
}
