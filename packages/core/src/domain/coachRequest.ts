/**
 * Asking to be coached and the coach's answers (canvas P2, R3, C1–C6, A1–A5). The server keeps
 * the rules (Features/Coach/CoachIntake.cs); this is what the apps need to show where a request
 * stands and what can be done next.
 */
export type RequestStage = "asked" | "waiting" | "offered" | "notafit" | "withdrawn";
export type OfferState = "open" | "replaced" | "withdrawn" | "taken" | "expired";

export interface AskQuestion {
  id: string;
  label: string;
  kind: "text" | "choice";
  options: string[] | null;
  optional: boolean;
}

export interface RequestAnswer {
  questionId: string;
  /** The question as it was asked. */
  question: string;
  value: string;
}

/** What an offer's card shows (also the CardJson of "offer" and "offer-changed" messages). */
export interface OfferCard {
  offerId: string;
  packageName: string;
  packageDescription: string;
  amountCents: number;
  currency: string;
  interval: "month" | "once";
  weeks: number | null;
  /** Paid through LogIt (false: the coach sorts payment out themselves). */
  pays: boolean;
  holdUntilMs: number;
  startsOnMs: number | null;
  firstChargeOnMs: number | null;
}

export interface RequestOffer {
  card: OfferCard;
  /** As the server saw it; `offerStateNow` re-checks the hold against the clock. */
  state: OfferState;
  createdAt: string;
  /** The package it offers (null: no payment through LogIt); missing from older servers. */
  packageId?: string | null;
  holdDays?: number;
}

/** The kinds of request steps recorded as cards in the conversation (CoachMessage.kind). */
export type RequestEvent =
  | "asked" | "offer" | "offer-changed" | "offer-withdrawn" | "waitlist" | "closed" | "withdrawn" | "reopened" | "joined" | "leaving"
  // Pausing and ending (canvas E1, E2, M1, Z2).
  | "paused" | "resumed" | "ended" | "stopping" | "stopped"
  // Payments (canvas K14, K18, Q9).
  | "package-change" | "package-change-accepted" | "package-change-declined" | "pay-for-change" | "plan-changed" | "refunded";

export interface CoachIntake {
  spots: number | null;
  whenFull: "waitlist" | "stop";
  expectSpots: string | null;
  questions: AskQuestion[];
  customQuestions: boolean;
  taken: number;
  full: boolean;
}

export interface OfferInput {
  /** Null: no payment through LogIt. */
  packageId: string | null;
  holdDays: number;
  /** ISO dates (YYYY-MM-DD); null = the day they take it / when coaching starts. */
  startsOn: string | null;
  firstChargeOn: string | null;
  message: string;
}

/** An open offer whose hold has passed has run out, whatever the last read said. */
export function offerStateNow(offer: RequestOffer, nowMs: number): OfferState {
  return offer.state === "open" && offer.card.holdUntilMs <= nowMs ? "expired" : offer.state;
}

/** One short line for a request in a list (canvas C1, C6, R4). */
export function requestLine(stage: RequestStage, offer: RequestOffer | null, nowMs: number): string {
  const state = offer ? offerStateNow(offer, nowMs) : null;
  switch (stage) {
    case "offered":
      return state === "expired" ? "Offer ran out" : "Offer sent";
    case "waiting":
      return "Waiting list";
    case "notafit":
      return "Not a fit";
    case "withdrawn":
      return "Withdrawn";
    default:
      return state === "withdrawn" ? "Offer withdrawn" : "New";
  }
}

/** What the coach can do with a request now (canvas C1, C4, C6). */
export function coachCan(stage: RequestStage, offer: RequestOffer | null, nowMs: number) {
  const open = stage === "asked" || stage === "waiting" || stage === "offered";
  const state = offer ? offerStateNow(offer, nowMs) : null;
  return {
    offer: open && state !== "open",
    editOffer: stage === "offered" && state === "open",
    offerAgain: stage === "offered" && state === "expired",
    withdrawOffer: stage === "offered" && state === "open",
    waitlist: stage === "asked" || stage === "offered",
    notAFit: open,
    reopen: stage === "notafit" || stage === "withdrawn",
  };
}

/** What the person who asked can do now (canvas A1–A5). */
export function clientCan(stage: RequestStage, offer: RequestOffer | null, nowMs: number) {
  const state = offer ? offerStateNow(offer, nowMs) : null;
  const closed = stage === "notafit" || stage === "withdrawn";
  return {
    take: stage === "offered" && state === "open",
    askAgain: stage === "offered" && state === "expired",
    withdraw: !closed && stage !== "waiting",
    leaveWaitingList: stage === "waiting",
    delete: closed,
    reply: !closed,
  };
}

/** A request step as one line in the conversation, said for whoever is reading (canvas A1–A5, C6). */
export function eventLine(kind: RequestEvent, reader: "client" | "coach", coach: string, client: string): string {
  const c = firstName(coach);
  const p = firstName(client);
  switch (kind) {
    case "asked":
      return reader === "client" ? `You asked ${c} to coach you` : `${p} asked you to coach them`;
    case "offer":
      return reader === "client" ? `${c} offered you a spot` : `You offered ${p} a spot`;
    case "offer-changed":
      return reader === "client" ? `${c} changed the offer` : `You changed the offer`;
    case "offer-withdrawn":
      return reader === "client" ? `${c} withdrew the offer. You weren't charged, and your request is still open.` : `You withdrew the offer. ${p}'s request is still open.`;
    case "waitlist":
      return reader === "client" ? `You're on ${c}'s waiting list` : `You put ${p} on your waiting list`;
    case "closed":
      return reader === "client" ? `${c} can't coach you right now. Nothing was shared and nothing was paid.` : `You closed ${p}'s request`;
    case "withdrawn":
      return reader === "client" ? "You withdrew your request" : `${p} withdrew their request`;
    case "reopened":
      return reader === "client" ? `${c} reopened your request` : `You reopened ${p}'s request`;
    case "joined":
      return reader === "client" ? `You took the spot. ${c} is your coach now.` : `${p} took the spot. Coaching has started.`;
    case "paused":
      return reader === "client" ? `${c} paused coaching` : `You paused coaching with ${p}`;
    case "resumed":
      return reader === "client" ? `${c} is back: coaching carries on` : `Coaching with ${p} carries on`;
    case "ended":
      return reader === "client" ? `${c} ended coaching` : `Coaching with ${p} ended`;
    case "package-change-accepted":
      return reader === "client" ? "You accepted the change of package" : `${p} accepted the change of package`;
    case "package-change-declined":
      return reader === "client" ? "You kept your package" : `${p} kept their package`;
    case "package-change":
    case "pay-for-change":
    case "plan-changed":
    case "refunded":
    case "stopping":
    case "stopped":
      // The server's words carry the end date or the refund.
      return "";
    case "leaving":
      // The coach reads the server's words, which carry the end date.
      return reader === "client" ? `You moved to another coach. Coaching with ${c} ends when what you paid for runs out.` : "";
    default:
      return ""; // a step a newer server knows: the message's own words are shown instead
  }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** The words "Ask Sam to offer it again" sends as an ordinary message (canvas A5). */
export const ASK_AGAIN_TEXT = "Is the spot still free? Could you offer it again?";

/** Who a step reads as for this viewer: the coach sends offers and answers; the client withdraws and joins. */
export function readerOf(kind: RequestEvent, mine: boolean): "client" | "coach" {
  const clientSends = kind === "withdrawn" || kind === "joined" || kind === "asked" || kind === "leaving" || kind === "stopping" || kind === "stopped" || kind === "package-change-accepted" || kind === "package-change-declined";
  return clientSends === mine ? "client" : "coach";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (ms: number) => `${new Date(ms).getDate()} ${MONTHS[new Date(ms).getMonth()]}`;

/** A request I sent, in one line for lists (canvas R4, R5). */
export function sentLine(
  r: { stage?: RequestStage; requestedAt: string; waitingSince?: string | null; expectSpots?: string | null; offer?: RequestOffer | null; closed?: boolean },
  nowMs: number,
): string {
  const stage = r.stage ?? "asked";
  if (r.closed || stage === "notafit" || stage === "withdrawn") return stage === "withdrawn" ? "Withdrawn" : "Closed";
  if (stage === "waiting") {
    const since = Date.parse(r.waitingSince ?? r.requestedAt);
    return `Waiting list since ${dayMonth(since)}${r.expectSpots ? ` · spots in ${r.expectSpots}` : ""}`;
  }
  const offer = r.offer ? offerStateNow(r.offer, nowMs) : null;
  if (stage === "offered" && offer === "open") return `Offer to look at · held until ${dayMonth(r.offer!.card.holdUntilMs)}`;
  if (stage === "offered" && offer === "expired") return "The offer ran out";
  const days = Math.floor((nowMs - Date.parse(r.requestedAt)) / 86_400_000);
  return `Request sent ${days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`;
}
