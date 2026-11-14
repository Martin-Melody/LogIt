import { describe, expect, it } from "vitest";
import type { BillingStatus } from "@logit/core/api/client";
import type { PlayOffer, PlayProduct } from "./playBilling";
import { describePeriod, pickOffer, planCardModel, recurringPhase, trialText, yearlySaving } from "./plans";

const phase = (formattedPrice: string, priceMicros: number, billingPeriod: string, recurrence = 1) => ({
  formattedPrice, priceMicros, currency: "EUR", billingPeriod, cycles: 0, recurrence,
});

const monthly: PlayOffer = { basePlanId: "monthly", offerId: null, offerToken: "m", phases: [phase("€5.99", 5_990_000, "P1M")] };
const yearly: PlayOffer = { basePlanId: "yearly", offerId: null, offerToken: "y", phases: [phase("€49.99", 49_990_000, "P1Y")] };
const trial: PlayOffer = {
  basePlanId: "monthly", offerId: "trial-7d", offerToken: "t",
  phases: [phase("Free", 0, "P7D", 2), phase("€5.99", 5_990_000, "P1M")],
};
const pro: PlayProduct = { productId: "logit_pro", name: "Pro", offers: [monthly, yearly] };

describe("offers", () => {
  it("picks the base plan for the period", () => {
    expect(pickOffer(pro, "monthly")?.offerToken).toBe("m");
    expect(pickOffer(pro, "yearly")?.offerToken).toBe("y");
    expect(pickOffer(undefined, "monthly")).toBeUndefined();
  });

  it("prefers a free trial the person is eligible for, and shows its real price", () => {
    const withTrial = { ...pro, offers: [monthly, trial, yearly] };
    const offer = pickOffer(withTrial, "monthly");
    expect(offer?.offerToken).toBe("t");
    expect(trialText(offer)).toBe("Free for 7 days");
    expect(recurringPhase(offer)?.formattedPrice).toBe("€5.99");
    expect(trialText(monthly)).toBeNull();
  });

  it("works out the yearly saving", () => {
    expect(yearlySaving(pro)).toBe(30); // 49.99 vs 71.88
    expect(yearlySaving({ ...pro, offers: [monthly] })).toBeNull();
  });

  it("describes periods", () => {
    expect(describePeriod("P1M")).toBe("1 month");
    expect(describePeriod("P2W")).toBe("2 weeks");
    expect(describePeriod("P1Y")).toBe("1 year");
  });
});

const sub = (over: Partial<NonNullable<BillingStatus["subscription"]>>): BillingStatus => ({
  tier: "Pro",
  subscriptionActive: true,
  manualTier: null,
  webCheckout: false,
  subscription: {
    source: "google", plan: "Pro", state: "active", expiresAt: "2026-12-14T10:00:00Z",
    autoRenewing: true, grantsAccess: true, productId: "logit_pro", manageUrl: null, ...over,
  },
});
const opts = { selfHosted: false, tier: "Pro", canBuyHere: true, locale: "en-IE" };

describe("plan card", () => {
  it("Free offers the plans only where they can be bought", () => {
    const free: BillingStatus = { tier: "Free", subscriptionActive: false, subscription: null };
    expect(planCardModel(free, opts).primary?.action).toBe("plans");
    expect(planCardModel(free, { ...opts, canBuyHere: false }).primary).toBeNull();
    expect(planCardModel(null, opts).title).toBe("Free");
  });

  it("active Google plan: renews, manage in Google Play", () => {
    const m = planCardModel(sub({}), opts);
    expect(m.badge?.text).toBe("Active");
    expect(m.text).toContain("Renews 14 December");
    expect(m.primary?.action).toBe("manage");
    expect(m.source).toBe("Google Play");
  });

  it("cancelled plan says when it ends", () => {
    const m = planCardModel(sub({ state: "canceled", autoRenewing: false }), opts);
    expect(m.badge?.text).toBe("Ends 14 December");
    expect(m.primary?.action).toBe("resubscribe");
  });

  it("payment problems point at Google Play", () => {
    expect(planCardModel(sub({ state: "gracePeriod" }), opts).badge?.tone).toBe("warning");
    const hold = planCardModel(sub({ state: "onHold", grantsAccess: false }), opts);
    expect(hold.badge?.tone).toBe("danger");
    expect(hold.primary?.action).toBe("fixPayment");
  });

  it("a plan from another store can't be managed here", () => {
    const m = planCardModel(sub({ source: "apple" }), opts);
    expect(m.primary).toBeNull();
    expect(m.text).toContain("App Store");
  });

  it("a plan given by hand has nothing to manage", () => {
    const given: BillingStatus = { tier: "Studio", subscriptionActive: false, manualTier: "Studio", subscription: null };
    const m = planCardModel(given, opts);
    expect(m.title).toBe("Studio");
    expect(m.source).toBe("From LogIt");
    expect(m.primary).toBeNull();
  });

  it("self-hosted includes everything and sells nothing", () => {
    const m = planCardModel(sub({}), { ...opts, selfHosted: true });
    expect(m.title).toBe("Everything included");
    expect(m.primary).toBeNull();
  });

  it("an expired plan reads as Free", () => {
    expect(planCardModel(sub({ state: "expired", grantsAccess: false }), opts).title).toBe("Free");
  });

  it("the dashboard links Google plans to Play's page and Stripe plans to the portal", () => {
    const web = { ...opts, canBuyHere: false, manageGoogle: true, stripePortal: true };
    expect(planCardModel(sub({ state: "gracePeriod" }), web).primary?.action).toBe("fixPayment");
    expect(planCardModel(sub({}), web).secondary).toBeNull();
    const stripe = planCardModel(sub({ source: "stripe" }), web);
    expect(stripe.primary).toEqual({ action: "portal", label: "Manage subscription" });
    expect(planCardModel({ tier: "Free", subscriptionActive: false, subscription: null }, web).text).toContain("Android app");
  });
});
