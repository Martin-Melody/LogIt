import type { BillingStatus } from "@logit/core/api/client";
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

// ── The plan card in Settings ────────────────────────────────────────────────

export type PlanAction = "plans" | "manage" | "fixPayment" | "resubscribe";
export type PlanCardModel = {
  title: string;
  badge: { text: string; tone: "success" | "neutral" | "warning" | "danger" } | null;
  source: string | null;
  text: string;
  primary: { action: PlanAction; label: string } | null;
  secondary: { action: PlanAction; label: string } | null;
  /** Primary rendered as a quiet outline button rather than the filled one. */
  quietPrimary?: boolean;
};

export function formatDay(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long" });
}

const SOURCE_LABEL = { google: "Google Play", apple: "App Store", stripe: "Web" } as const;

/** What the Settings plan card says for a billing status. `canBuyHere`: this device sells
 * plans (the Android app). */
export function planCardModel(
  status: BillingStatus | null,
  opts: { selfHosted: boolean; tier: string; canBuyHere: boolean; locale?: string },
): PlanCardModel {
  if (opts.selfHosted) {
    return {
      title: "Everything included",
      badge: null,
      source: null,
      text: "You're on your own server, so sync, the dashboard and coaching are all on. Plans only apply to getlogit.app.",
      primary: null,
      secondary: null,
    };
  }

  const sub = status?.subscription ?? null;
  const day = (iso: string | null | undefined) => formatDay(iso, opts.locale);
  const plans = opts.canBuyHere ? { action: "plans" as const, label: "Plans" } : null;

  // A plan given in the admin page, with no paid subscription giving more.
  if (status?.manualTier && !(sub?.grantsAccess)) {
    return {
      title: status.manualTier,
      badge: { text: "Active", tone: "success" },
      source: "From LogIt",
      text: "This plan was given to you, so there's nothing to pay or manage.",
      primary: null,
      secondary: null,
    };
  }

  if (!sub || sub.state === "expired" || sub.state === "revoked") {
    return {
      title: "Free",
      badge: null,
      source: null,
      text: opts.canBuyHere
        ? "Everything on this phone is free. Pro adds backup and sync between devices and the web dashboard."
        : "Everything on this phone is free. Pro adds backup and sync between devices and the web dashboard. Plans are bought in the LogIt Android app.",
      primary: opts.canBuyHere ? { action: "plans", label: "See plans" } : null,
      secondary: null,
    };
  }

  const source = SOURCE_LABEL[sub.source];
  const inThisStore = sub.source === "google" && opts.canBuyHere;
  const elsewhere =
    sub.source === "apple"
      ? "Bought on iPhone. Manage it in the App Store on that device."
      : sub.source === "stripe"
        ? "Bought on the web. Manage it at app.getlogit.app."
        : "Bought through Google Play. Manage it in the Play Store on your Android phone.";

  switch (sub.state) {
    case "active":
      return {
        title: sub.plan,
        badge: { text: "Active", tone: "success" },
        source,
        text: `Renews ${day(sub.expiresAt)}. ${sub.plan === "Studio" ? "Sync, the dashboard and coaching are on." : "Sync and the web dashboard are on."}${inThisStore ? "" : " " + elsewhere}`,
        primary: inThisStore ? { action: "manage", label: "Manage in Google Play" } : null,
        secondary: inThisStore ? plans : null,
        quietPrimary: true,
      };
    case "canceled":
      return {
        title: sub.plan,
        badge: { text: `Ends ${day(sub.expiresAt)}`, tone: "neutral" },
        source,
        text: `You cancelled, so it won't renew. ${sub.plan} stays on until ${day(sub.expiresAt)}; after that your data stays on this phone and sync stops.`,
        primary: inThisStore ? { action: "resubscribe", label: "Resubscribe in Google Play" } : null,
        secondary: null,
        quietPrimary: true,
      };
    case "gracePeriod":
      return {
        title: sub.plan,
        badge: { text: "Payment problem", tone: "warning" },
        source,
        text: `${source} couldn't take your last payment. Update your payment method to keep ${sub.plan}; it stays on while they try again.`,
        primary: inThisStore ? { action: "fixPayment", label: "Fix payment in Google Play" } : null,
        secondary: null,
      };
    case "onHold":
    case "paused":
      return {
        title: sub.plan,
        badge: { text: sub.state === "paused" ? "Paused" : "On hold", tone: "danger" },
        source,
        text:
          sub.state === "paused"
            ? `${sub.plan} is paused in ${source}. Sync is off until it resumes; nothing on this phone is lost.`
            : `${sub.plan} is off until the payment goes through. Sync is paused; nothing on this phone is lost. Fix it and ${sub.plan} comes straight back.`,
        primary: inThisStore
          ? { action: sub.state === "paused" ? "manage" : "fixPayment", label: sub.state === "paused" ? "Manage in Google Play" : "Fix payment in Google Play" }
          : null,
        secondary: null,
      };
    case "pending":
      return {
        title: sub.plan,
        badge: { text: "Waiting for payment", tone: "neutral" },
        source,
        text: `${source} is still waiting for the payment to clear. ${sub.plan} starts as soon as it does.`,
        primary: null,
        secondary: null,
      };
  }
}
