// What Today's and Your month's cards share (canvas W5, W13): the month from the server, each
// client's workouts (only for those who share them) and the payments overview. Loaded once and
// kept while you move between the two pages.

import { coachApi, type CoachMonthData } from "@logit/core/api/coachApi";
import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
import type { PaymentClient } from "@logit/core/domain/coachPayments";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { getWebDeps } from "$lib/deps";
import type { ClientSummary } from "../coachingData";

class MonthData {
  months = $state<Record<string, CoachMonthData>>({});
  sessions = $state<Record<string, WorkoutSession[]>>({});
  payments = $state<PaymentClient[] | null>(null);
  private pending = new Map<string, Promise<unknown>>();

  private once<T>(key: string, f: () => Promise<T>): Promise<T> {
    if (!this.pending.has(key)) this.pending.set(key, f().catch((e) => { this.pending.delete(key); throw e; }));
    return this.pending.get(key) as Promise<T>;
  }

  month(m: string): Promise<CoachMonthData> {
    return this.once(`m:${m}`, async () => (this.months = { ...this.months, [m]: await coachApi.getMonth(m) })[m]!);
  }

  /** Every shown client's finished workouts (those who share them). */
  async clientSessions(clients: ClientSummary[]): Promise<void> {
    await Promise.all(clients.filter((c) => c.sharing.workouts).map((c) => this.once(`s:${c.id}`, async () => {
      const all = await getWebDeps(c.id).workoutRepo.listAllSessions().catch(() => []);
      this.sessions = { ...this.sessions, [c.id]: all.filter((s) => s.endedAtMs != null) };
    })));
  }

  loadPayments(): Promise<unknown> {
    return this.once("payments", async () => (this.payments = (await coachPaymentsApi.overview()).clients));
  }
}

export const monthData = new MonthData();

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export function monthRange(key: string): { fromMs: number; toMs: number; label: string } {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const thisYear = new Date().getFullYear() === y;
  return { fromMs: from.getTime(), toMs: to.getTime(), label: from.toLocaleDateString(undefined, { month: "long", ...(thisYear ? {} : { year: "numeric" }) }) };
}
export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
