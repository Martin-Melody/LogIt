import { describe, expect, it } from "vitest";
import type { ClosingClient } from "../api/client";
import { refundFor, refundTotalText, unusedLabel } from "./accountClosing";

const DAY = 86_400_000;
const now = Date.UTC(2026, 11, 10);
const client = (over: Partial<ClosingClient> = {}): ClosingClient => ({
  relationshipId: "r1", name: "Aoife", username: "aoife", state: "paid", currency: "eur",
  lastPaidCents: 8000, lastPaidAtMs: now - 4 * DAY, paidUntilMs: now + 27 * DAY, unusedCents: 6967, ...over,
});

describe("account closing refunds", () => {
  it("gives the unused share, the full payment, or a capped amount per client", () => {
    const c = client();
    expect(refundFor(c, "unused")).toBe(6967);
    expect(refundFor(c, "full")).toBe(8000);
    expect(refundFor(c, "perClient", { r1: 99_999 })).toBe(8000);
    expect(refundFor(c, "perClient", { r1: -5 })).toBe(0);
    expect(refundFor(c, "perClient")).toBe(6967); // starts at the unused share
  });

  it("never refunds someone who pays another way or hasn't paid", () => {
    expect(refundFor(client({ state: "elsewhere" }), "full")).toBe(0);
    expect(refundFor(client({ lastPaidCents: 0, unusedCents: 0 }), "full")).toBe(0);
  });

  it("totals per currency", () => {
    const list = [client(), client({ relationshipId: "r2", lastPaidCents: 20000, unusedCents: 15000 })];
    expect(refundTotalText(list, "unused")).toBe("€219.67");
    expect(refundTotalText(list, "full")).toBe("€280");
    expect(refundTotalText([client({ currency: "gbp" }), client({ relationshipId: "r2" })], "full")).toBe("£80 + €80");
    expect(refundTotalText([], "unused")).toBe("€0");
  });

  it("labels the days left", () => {
    expect(unusedLabel(client(), now)).toBe("27 of 31 days");
    expect(unusedLabel(client({ paidUntilMs: now - DAY }), now)).toBeNull();
    expect(unusedLabel(client({ lastPaidAtMs: null }), now)).toBeNull();
  });
});
