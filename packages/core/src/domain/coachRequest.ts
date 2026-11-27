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
}

/** The kinds of request steps recorded as cards in the conversation (CoachMessage.kind). */
export type RequestEvent =
  | "asked" | "offer" | "offer-changed" | "offer-withdrawn" | "waitlist" | "closed" | "withdrawn" | "reopened" | "joined";

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
