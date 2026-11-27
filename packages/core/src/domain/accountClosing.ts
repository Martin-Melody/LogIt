import type { ClosingClient } from "../api/client";
import { formatMoney } from "./coachPayments";

/** How a closing coach refunds clients (K5): one rule, or an amount per client (K16). */
export type RefundChoice = "unused" | "full" | "perClient";

const DAY = 86_400_000;

/** A client whose payment through LogIt can be refunded. */
export function refundable(c: ClosingClient): boolean {
  return c.lastPaidCents > 0 && c.state !== "elsewhere";
}

/** What one client gets back under a rule; `perClient` amounts are capped at what they paid. */
export function refundFor(c: ClosingClient, choice: RefundChoice, perClient: Record<string, number> = {}): number {
  if (!refundable(c)) return 0;
  if (choice === "full") return c.lastPaidCents;
  if (choice === "perClient") {
    const asked = perClient[c.relationshipId] ?? c.unusedCents;
    return Math.min(Math.max(0, Math.round(asked)), c.lastPaidCents);
  }
  return c.unusedCents;
}

/** Total refunds as money text, e.g. "€312"; refunds in several currencies are listed. */
export function refundTotalText(clients: ClosingClient[], choice: RefundChoice, perClient: Record<string, number> = {}): string {
  const byCurrency = new Map<string, number>();
  for (const c of clients) {
    const cents = refundFor(c, choice, perClient);
    if (cents > 0) byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + cents);
  }
  if (byCurrency.size === 0) return formatMoney(0, clients[0]?.currency ?? "eur");
  return [...byCurrency].map(([cur, cents]) => formatMoney(cents, cur)).join(" + ");
}

/** "27 of 31 days" left of what they paid for, or null when nothing is left to count. */
export function unusedLabel(c: ClosingClient, nowMs: number): string | null {
  if (c.lastPaidAtMs == null || c.paidUntilMs == null || c.paidUntilMs <= nowMs) return null;
  const total = Math.max(1, Math.round((c.paidUntilMs - c.lastPaidAtMs) / DAY));
  const left = Math.min(total, Math.max(0, Math.ceil((c.paidUntilMs - nowMs) / DAY)));
  return `${left} of ${total} days`;
}
