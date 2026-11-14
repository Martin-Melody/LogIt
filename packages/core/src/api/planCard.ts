import type { BillingStatus } from "./client";

/**
 * What a plan card says for a billing status, shared by the app (Settings › Account) and the
 * web dashboard (Account), so both describe a plan the same way.
 */

// ── The plan card in Settings ────────────────────────────────────────────────

/** plans: open the in-app Plans screen. manage/fixPayment/resubscribe: the store's page
 * (Google Play: subscription.manageUrl). portal: the Stripe billing portal (web only). */
export type PlanAction = "plans" | "manage" | "fixPayment" | "resubscribe" | "portal";
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

/**
 * - canBuyHere: this device sells plans (the Android app).
 * - manageGoogle: a Google Play plan can be managed from here (default canBuyHere; the
 *   dashboard links to Play's web page instead).
 * - stripePortal: a Stripe plan can be managed here (the dashboard's billing portal).
 */
export function planCardModel(
  status: BillingStatus | null,
  opts: {
    selfHosted: boolean;
    tier: string;
    canBuyHere: boolean;
    manageGoogle?: boolean;
    stripePortal?: boolean;
    locale?: string;
  },
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
        : "The app itself is free. Pro adds backup and sync between devices and the web dashboard. Plans are bought in the LogIt Android app.",
      primary: opts.canBuyHere ? { action: "plans", label: "See plans" } : null,
      secondary: null,
    };
  }

  const source = SOURCE_LABEL[sub.source];
  const viaPortal = sub.source === "stripe" && !!opts.stripePortal;
  const inThisStore = (sub.source === "google" && (opts.manageGoogle ?? opts.canBuyHere)) || viaPortal;
  // The button for a store action: Google Play's page, or the Stripe portal.
  const act = (action: "manage" | "fixPayment" | "resubscribe", googleLabel: string, webLabel: string) =>
    inThisStore ? (viaPortal ? { action: "portal" as const, label: webLabel } : { action, label: googleLabel }) : null;
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
        primary: act("manage", "Manage in Google Play", "Manage subscription"),
        secondary: inThisStore && !viaPortal ? plans : null,
        quietPrimary: true,
      };
    case "canceled":
      return {
        title: sub.plan,
        badge: { text: `Ends ${day(sub.expiresAt)}`, tone: "neutral" },
        source,
        text: `You cancelled, so it won't renew. ${sub.plan} stays on until ${day(sub.expiresAt)}; after that your data stays on this phone and sync stops.`,
        primary: act("resubscribe", "Resubscribe in Google Play", "Resubscribe"),
        secondary: null,
        quietPrimary: true,
      };
    case "gracePeriod":
      return {
        title: sub.plan,
        badge: { text: "Payment problem", tone: "warning" },
        source,
        text: `${source} couldn't take your last payment. Update your payment method to keep ${sub.plan}; it stays on while they try again.`,
        primary: act("fixPayment", "Fix payment in Google Play", "Update payment"),
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
        primary: sub.state === "paused"
          ? act("manage", "Manage in Google Play", "Manage subscription")
          : act("fixPayment", "Fix payment in Google Play", "Update payment"),
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
