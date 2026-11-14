import type { PlayOffer, PlayProduct } from "./playBilling";

/** Play Console subscription ids; monthly and yearly are base plans of each. Must match the
 * server's GooglePlay:ProProductId / StudioProductId. */
export const PRODUCT_IDS = { Pro: "logit_pro", Studio: "logit_studio" } as const;
export type PaidPlan = keyof typeof PRODUCT_IDS;
export type Period = "monthly" | "yearly";

/** The offer to sell for a plan and period: a free-trial offer the person is still eligible
 * for (Play only lists eligible ones), else the plain base plan. */
export function pickOffer(product: PlayProduct | undefined, period: Period): PlayOffer | undefined {
  const offers = product?.offers.filter((o) => o.basePlanId === period) ?? [];
  return (
    offers.find((o) => o.phases[0]?.priceMicros === 0) ??
    offers.find((o) => o.offerId === null) ??
    offers[0]
  );
}

/** The phase that repeats (the real price), not a trial or intro phase. */
export function recurringPhase(offer: PlayOffer | undefined) {
  if (!offer) return undefined;
  return offer.phases.find((p) => p.recurrence === 1) ?? offer.phases[offer.phases.length - 1];
}

/** "Free for 7 days" when the offer starts with a free trial. */
export function trialText(offer: PlayOffer | undefined): string | null {
  const first = offer?.phases[0];
  if (!first || first.priceMicros !== 0) return null;
  return `Free for ${describePeriod(first.billingPeriod)}`;
}

/** P7D → "7 days", P1W → "1 week", P1M → "1 month", P1Y → "1 year". */
export function describePeriod(iso: string): string {
  const m = /^P(\d+)([DWMY])$/.exec(iso);
  if (!m) return iso;
  const n = Number(m[1]);
  const unit = { D: "day", W: "week", M: "month", Y: "year" }[m[2] as "D" | "W" | "M" | "Y"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Whole percent saved by paying yearly, or null when it isn't cheaper. */
export function yearlySaving(product: PlayProduct | undefined): number | null {
  const monthly = recurringPhase(pickOffer(product, "monthly"));
  const yearly = recurringPhase(pickOffer(product, "yearly"));
  if (!monthly || !yearly || monthly.priceMicros <= 0) return null;
  const pct = Math.floor((1 - yearly.priceMicros / (monthly.priceMicros * 12)) * 100);
  return pct >= 1 ? pct : null;
}

export function planForProduct(productId: string | undefined): PaidPlan | null {
  if (productId === PRODUCT_IDS.Pro) return "Pro";
  if (productId === PRODUCT_IDS.Studio) return "Studio";
  return null;
}

// The plan card's wording is shared with the web dashboard.
export { planCardModel, formatDay, type PlanAction, type PlanCardModel } from "@logit/core/api/planCard";
