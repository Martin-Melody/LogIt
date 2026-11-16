// Coach payments: clients pay their coach through the coach's own Stripe account, on the web.
// The app only ever shows status (no price, no pay button) because of app store rules.

export type PaymentRule = "keep" | "pause" | "end";
export type PaymentInterval = "month" | "once";
export type PaymentState = "paid" | "failed" | "ended";
export type PaymentMode = "stripe" | "elsewhere";

/** What a client is told about paying one coach (from /coach/coaches). */
export interface ClientPayment {
  mode: PaymentMode;
  packageName: string;
  interval: PaymentInterval;
  state: PaymentState;
  /** ISO. End of the month paid for, end of a one-off package, or the date a coach marked. */
  paidUntil: string | null;
  /** ISO. When the client stopped being paid up; null = paid up. */
  unpaidSince: string | null;
  stopsAtPeriodEnd: boolean;
  rule: PaymentRule;
  /** ISO. When coaching pauses or ends if it stays unpaid; null = never. */
  actionAt: string | null;
  /** The coach lets LogIt tell the client about a problem. */
  showNote: boolean;
  /** A monthly plan the client can stop at the end of the month. */
  canStop: boolean;
}

/** The package on an invite link, as the person opening it sees it. */
export interface LinkPackage {
  name: string;
  description: string;
  amountCents: number;
  currency: string;
  interval: PaymentInterval;
  weeks: number | null;
}

export interface CoachPackage extends LinkPackage {
  id: string;
  hidden: boolean;
  /** Names of the links it's on. */
  links: string[];
  /** Clients paying for it now. */
  clients: number;
}

export interface PaymentAccount {
  /** Stripe account made (onboarding may not be finished). */
  connected: boolean;
  /** Can take card payments. */
  ready: boolean;
  requirementsDue: boolean;
  displayName: string | null;
  currency: string;
  country: string;
}

export interface PaymentSettings {
  failRule: PaymentRule;
  failDays: number;
  emailOnFail: boolean;
  showClientNote: boolean;
}

export interface PaymentClient {
  relationshipId: string;
  client: { id: string; username: string; displayName: string; avatarUrl: string | null };
  status: "active" | "paused";
  since: string;
  /** "none" = not paying through LogIt and not marked as paid elsewhere. */
  mode: PaymentMode | "none";
  packageName: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: PaymentInterval | null;
  state: PaymentState | null;
  paidUntil: string | null;
  unpaidSince: string | null;
  stopsAtPeriodEnd: boolean;
  /** This client's own rule; null = the coach's default. */
  ownRule: PaymentRule | null;
  ownDays: number | null;
  /** The rule that applies (own or default). */
  rule: PaymentRule;
  days: number;
  actionAt: string | null;
}

export interface PaymentsOverview {
  /** Payments are set up on this server at all. */
  configured: boolean;
  account: PaymentAccount;
  settings: PaymentSettings;
  packages: CoachPackage[];
  clients: PaymentClient[];
  summary: {
    currency: string;
    monthCents: number;
    monthCount: number;
    paying: number;
    elsewhere: number;
    problems: number;
  };
}

export const PAYMENT_COUNTRIES: { code: string; name: string }[] = [
  { code: "ie", name: "Ireland" },
  { code: "gb", name: "United Kingdom" },
  { code: "us", name: "United States" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "nz", name: "New Zealand" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "nl", name: "Netherlands" },
  { code: "be", name: "Belgium" },
  { code: "pt", name: "Portugal" },
  { code: "at", name: "Austria" },
  { code: "fi", name: "Finland" },
  { code: "se", name: "Sweden" },
  { code: "dk", name: "Denmark" },
  { code: "no", name: "Norway" },
];

/** "€120", "€49.50". */
export function formatMoney(cents: number, currency: string): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency.toUpperCase()}`;
  }
}

/** "€120 a month", "€300 once · 12 weeks". */
export function priceText(p: Pick<LinkPackage, "amountCents" | "currency" | "interval" | "weeks">): string {
  const money = formatMoney(p.amountCents, p.currency);
  if (p.interval === "month") return `${money} a month`;
  return p.weeks ? `${money} once · ${p.weeks} week${p.weeks === 1 ? "" : "s"}` : `${money} once`;
}

/** "16 Dec" (adds the year when it isn't this year). */
export function shortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function ruleText(rule: PaymentRule, days: number): string {
  if (rule === "keep") return "Keep coaching, just tell me";
  return `${rule === "pause" ? "Pause" : "End"} after ${days} day${days === 1 ? "" : "s"}`;
}

export type Tone = "ok" | "warn" | "bad" | "muted";

/** The chip on the coach's Payments list. */
export function coachClientChip(c: PaymentClient, now: Date = new Date()): { label: string; tone: Tone } {
  if (c.status === "paused") return { label: "Paused · unpaid", tone: "bad" };
  if (c.mode === "none") return { label: "Not set", tone: "muted" };
  if (c.mode === "elsewhere") {
    if (c.paidUntil && new Date(c.paidUntil) <= now) return { label: "Due · paid elsewhere", tone: "warn" };
    return { label: c.paidUntil ? `Marked paid to ${shortDate(c.paidUntil, now)}` : "Paid elsewhere", tone: "muted" };
  }
  if (c.state === "failed") return { label: "Failed · retrying", tone: "bad" };
  if (c.state === "ended") return { label: c.interval === "once" ? "Ended" : "Stopped", tone: "warn" };
  if (c.stopsAtPeriodEnd) return { label: `Paid · stops ${shortDate(c.paidUntil, now)}`, tone: "ok" };
  return { label: "Paid", tone: "ok" };
}

/** What the coach needs to do something about, oldest problem first. */
export function needsCoach(clients: PaymentClient[], now: Date = new Date()): PaymentClient[] {
  return clients
    .filter((c) =>
      c.status === "paused" ||
      (c.mode === "stripe" && c.unpaidSince !== null) ||
      (c.mode === "elsewhere" && c.paidUntil !== null && new Date(c.paidUntil) <= now))
    .sort((a, b) => (a.unpaidSince ?? a.paidUntil ?? "").localeCompare(b.unpaidSince ?? b.paidUntil ?? ""));
}

/** One line for the coach about a client in `needsCoach`. */
export function coachProblemText(c: PaymentClient, now: Date = new Date()): string {
  const name = c.client.displayName || c.client.username;
  const action = c.actionAt
    ? ` Your rule: coaching ${c.rule === "end" ? "ends" : "pauses"} on ${shortDate(c.actionAt, now)} if it's still unpaid.`
    : c.rule === "keep" ? " Your rule for them is to keep coaching." : "";
  if (c.status === "paused") return `${name}'s coaching is paused until they pay. Paying restarts it straight away.`;
  if (c.mode === "elsewhere") return `${name} was marked paid outside LogIt up to ${shortDate(c.paidUntil, now)}. Mark them paid again when they pay.`;
  if (c.state === "failed")
    return `${name}'s payment didn't go through on ${shortDate(c.unpaidSince, now)}. Stripe tries the card again and emails them a link to update it.${action}`;
  if (c.interval === "once") return `${name}'s ${c.packageName} ended on ${shortDate(c.unpaidSince, now)}. Send them a new link or mark them paid elsewhere.${action}`;
  return `${name}'s plan stopped on ${shortDate(c.unpaidSince, now)}.${action}`;
}

export interface ClientNote {
  tone: Tone;
  title: string;
  body: string;
}

/**
 * What My coach says about paying (web and app). Never a price, a pay button or a link to
 * pay. Null when there's nothing to say.
 */
export function clientPaymentNote(
  payment: ClientPayment | null | undefined,
  status: "active" | "paused" | undefined,
  coachName: string,
  now: Date = new Date(),
): ClientNote | null {
  if (status === "paused") {
    return {
      tone: "muted",
      title: `Coaching with ${coachName} is paused`,
      body: `Your program, check-ins and messages come back as soon as the payment goes through. ${coachName} can't see your new data while it's paused.`,
    };
  }
  if (!payment) return null;
  if (payment.mode === "elsewhere") return null;

  const then = payment.actionAt
    ? ` If it isn't sorted by ${shortDate(payment.actionAt, now)}, coaching ${payment.rule === "end" ? "ends" : "pauses until it is"}.`
    : "";
  if (payment.state === "failed") {
    if (!payment.showNote) return null;
    return {
      tone: "bad",
      title: `Your last payment to ${coachName} didn't go through`,
      body: `Stripe has emailed you a link to update your card.${then} Your own workouts and data aren't affected.`,
    };
  }
  if (payment.state === "ended") {
    if (!payment.showNote) return null;
    const what = payment.interval === "once" ? `Your ${payment.packageName} with ${coachName} has ended.` : `Your plan with ${coachName} has ended.`;
    return { tone: "warn", title: what, body: `Ask ${coachName} how to carry on.${then}` };
  }
  if (payment.interval === "once")
    return { tone: "ok", title: payment.packageName, body: `Paid to ${coachName}. Runs to ${shortDate(payment.paidUntil, now)}.` };
  if (payment.stopsAtPeriodEnd)
    return { tone: "ok", title: payment.packageName, body: `Paid to ${coachName} until ${shortDate(payment.paidUntil, now)}. Your plan stops then.` };
  return {
    tone: "ok",
    title: payment.packageName,
    body: `Paid to ${coachName}. Renews ${shortDate(payment.paidUntil, now)}. Receipts come by email from Stripe.`,
  };
}
