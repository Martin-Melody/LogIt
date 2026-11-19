import { describe, expect, it } from "vitest";
import {
  clientPaymentNote,
  coachClientChip,
  coachProblemText,
  formatMoney,
  needsCoach,
  priceText,
  ruleText,
  type ClientPayment,
  type PaymentClient,
} from "./coachPayments";

const NOW = new Date("2026-11-16T12:00:00Z");

const pay = (over: Partial<ClientPayment> = {}): ClientPayment => ({
  mode: "stripe",
  packageName: "Online coaching",
  interval: "month",
  state: "paid",
  paidUntil: "2026-12-16T12:00:00Z",
  unpaidSince: null,
  stopsAtPeriodEnd: false,
  rule: "pause",
  actionAt: null,
  showNote: true,
  canStop: true,
  ...over,
});

const client = (over: Partial<PaymentClient> = {}): PaymentClient => ({
  relationshipId: "r1",
  client: { id: "u1", username: "sarahkb", displayName: "Sarah", avatarUrl: null },
  status: "active",
  since: "2026-08-01T00:00:00Z",
  mode: "stripe",
  packageName: "Online coaching",
  amountCents: 12000,
  currency: "eur",
  interval: "month",
  state: "paid",
  paidUntil: "2026-12-01T00:00:00Z",
  unpaidSince: null,
  stopsAtPeriodEnd: false,
  ownRule: null,
  ownDays: null,
  rule: "pause",
  days: 7,
  actionAt: null,
  ...over,
});

describe("money", () => {
  it("drops cents only when there are none", () => {
    expect(formatMoney(12000, "eur")).toBe("€120");
    expect(formatMoney(4950, "eur")).toBe("€49.50");
    expect(formatMoney(12000, "gbp")).toBe("£120");
  });
  it("says how often", () => {
    expect(priceText({ amountCents: 12000, currency: "eur", interval: "month", weeks: null })).toBe("€120 a month");
    expect(priceText({ amountCents: 30000, currency: "eur", interval: "once", weeks: 12 })).toBe("€300 once · 12 weeks");
  });
  it("describes rules", () => {
    expect(ruleText("pause", 7)).toBe("Pause after 7 days");
    expect(ruleText("end", 1)).toBe("End after 1 day");
    expect(ruleText("keep", 7)).toBe("Keep coaching, just tell me");
  });
});

describe("what the client sees", () => {
  it("never mentions a price", () => {
    const note = clientPaymentNote(pay(), "active", "Alex", NOW)!;
    expect(note.body).toBe("Paid to Alex. Renews 16 Dec.");
    expect(note.body + note.title).not.toMatch(/€|\d+\.\d\d/);
  });
  it("warns about a failed payment with the coach's date", () => {
    const note = clientPaymentNote(pay({ state: "failed", unpaidSince: "2026-11-12T00:00:00Z", actionAt: "2026-11-19T00:00:00Z" }), "active", "Alex", NOW)!;
    expect(note.tone).toBe("bad");
    expect(note.title).toBe("Your card was declined on 12 Nov");
    expect(note.body).toContain("We've emailed you a link to update your card.");
    expect(note.body).toContain("If it isn't sorted by 19 Nov, coaching pauses until it is.");
  });
  it("stays quiet when the coach turned the note off", () => {
    expect(clientPaymentNote(pay({ state: "failed", showNote: false }), "active", "Alex", NOW)).toBeNull();
  });
  it("explains a pause whatever the note setting", () => {
    expect(clientPaymentNote(pay({ showNote: false }), "paused", "Alex", NOW)?.title).toBe("Coaching with Alex is paused");
  });
  it("says nothing for clients paying outside LogIt", () => {
    expect(clientPaymentNote(pay({ mode: "elsewhere" }), "active", "Alex", NOW)).toBeNull();
  });
  it("shows when a stopped plan ends", () => {
    expect(clientPaymentNote(pay({ stopsAtPeriodEnd: true }), "active", "Alex", NOW)?.body).toBe("Paid to Alex until 16 Dec. Your plan stops then.");
  });
});

describe("what the coach sees", () => {
  it("chips", () => {
    expect(coachClientChip(client(), NOW)).toEqual({ label: "Paid", tone: "ok" });
    expect(coachClientChip(client({ state: "failed" }), NOW).tone).toBe("bad");
    expect(coachClientChip(client({ status: "paused" }), NOW).label).toBe("Paused · unpaid");
    expect(coachClientChip(client({ mode: "elsewhere", paidUntil: "2026-11-30T23:59:00Z" }), NOW).label).toBe("Marked paid to 30 Nov");
    expect(coachClientChip(client({ mode: "elsewhere", paidUntil: "2026-11-10T23:59:00Z" }), NOW).tone).toBe("warn");
  });
  it("lists problems oldest first", () => {
    const list = needsCoach([
      client({ relationshipId: "ok" }),
      client({ relationshipId: "late", state: "failed", unpaidSince: "2026-11-12T00:00:00Z" }),
      client({ relationshipId: "older", state: "ended", interval: "once", unpaidSince: "2026-11-02T00:00:00Z" }),
      client({ relationshipId: "fine-elsewhere", mode: "elsewhere", paidUntil: "2026-12-30T00:00:00Z" }),
    ], NOW);
    expect(list.map((c) => c.relationshipId)).toEqual(["older", "late"]);
  });
  it("tells the coach what their rule will do", () => {
    const text = coachProblemText(client({ state: "failed", unpaidSince: "2026-11-12T00:00:00Z", actionAt: "2026-11-19T00:00:00Z" }), NOW);
    expect(text).toBe("Sarah's payment didn't go through on 12 Nov. LogIt has emailed them a link to update their card, and Stripe tries it again. Your rule: coaching pauses on 19 Nov if it's still unpaid.");
  });
});
