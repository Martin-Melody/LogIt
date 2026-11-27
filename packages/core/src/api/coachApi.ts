import { ApiError, apiClient, type ApiFetcher } from "./client";
import type { SwapRule } from "../domain/swaps";
import type { ClientPayment, LinkPackage } from "../domain/coachPayments";
import type { CoachProfile, MyCoachProfile } from "../domain/coachProfile";
import type { AskQuestion, CoachIntake, OfferCard, OfferInput, OfferState, RequestAnswer, RequestOffer, RequestStage } from "../domain/coachRequest";

export interface CoachClientUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** A sample client in your sandbox (only ever seen by its own coach). */
  isSample?: boolean;
}

/** What a client lets one coach read. The server enforces it on every coach read; a
 * switched-off area answers 403 with `code: "not_shared"`. */
export interface Sharing {
  workouts: boolean;
  nutrition: boolean;
  bodyweight: boolean;
  habits: boolean;
  checkins: boolean;
}

export type ShareArea = keyof Sharing;

export const SHARE_ALL: Sharing = { workouts: true, nutrition: true, bodyweight: true, habits: true, checkins: true };

/** The switches in the order and words the UI shows them. */
export const SHARE_AREAS: { key: ShareArea; label: string }[] = [
  { key: "workouts", label: "Workouts" },
  { key: "nutrition", label: "Nutrition diary" },
  { key: "bodyweight", label: "Body weight" },
  { key: "habits", label: "Habits" },
  { key: "checkins", label: "Check-ins" },
];

export interface ClientRelationship {
  relationshipId: string;
  client: CoachClientUser;
  /** Missing from servers older than the sharing switches (= everything shared). */
  sharing?: Sharing;
  /** When coaching started (ISO). */
  since?: string;
  /** This client's own swap rule; null/missing = the coach's default. */
  swapRule?: SwapRule | null;
}

export interface CoachRelationship {
  relationshipId: string;
  coach: CoachClientUser;
  sharing?: Sharing;
  since?: string;
  /** The swap rule that applies to me in this coach's programs (missing on older servers = any). */
  swapRule?: SwapRule;
  /** "paused" = coaching stopped until it's paid (missing on older servers = active). */
  status?: "active" | "paused";
  /** How I pay this coach through LogIt, if I do. Never carries a price (app store rules). */
  payment?: ClientPayment | null;
}

/** A coach's review of one of my check-ins. */
export interface MyCheckinReview {
  submissionId: string;
  coachId: string;
  reviewedAtMs: number;
  /** What the coach wrote back, when they replied while reviewing. */
  reply?: string | null;
}

export interface RosterEntry {
  relationshipId: string;
  client: CoachClientUser;
  lastSessionAtMs: number | null;
  sessions7d: number;
  sessions28d: number;
  programCount: number;
  checkinScheduleCount: number;
  assignedHabitCount: number;
  lastCheckinSubmittedAtMs: number | null;
  unreadFromClient: number;
  sharing?: Sharing;
  since?: string;
}

/** "notlive": the coach is trying Studio; only their sample clients can use it (canvas V3). */
export type InviteLinkState = "active" | "off" | "expired" | "full" | "notlive";

export interface InviteLink {
  id: string;
  /** "K7M2-Q9XH" */
  code: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  joined: number;
  waiting: number;
  state: InviteLinkState;
  /** The link's package: paid for when payAndStart, else picked for them when they ask. */
  packageId?: string | null;
  packageName?: string | null;
  /** "Pay and start straight away" (canvas L1). */
  payAndStart?: boolean;
  /** Everyone who asked or paid through it, whatever happened since. */
  asked?: number;
  /** False while trying Studio: real, not live yet (canvas V3). */
  live?: boolean;
}

/** Where a link sends people: the coach's profile with the link (canvas L1), or straight to
 * paying for a pay-and-start link. A self-hosted server has no getlogit.app: the web app's own ask page. */
export function linkUrl(link: Pick<InviteLink, "code" | "payAndStart">, username: string, opts: { webOrigin: string; marketingUrl: string; selfHosted: boolean }): string {
  const code = encodeURIComponent(link.code.replace("-", ""));
  if (link.payAndStart) return `${opts.webOrigin}/c/${code}`;
  return opts.selfHosted ? `${opts.webOrigin}/ask/${encodeURIComponent(username)}?l=${code}` : `${opts.marketingUrl}/@${encodeURIComponent(username)}?l=${code}`;
}

/** What someone opening a link sees. */
export interface InviteLinkInfo {
  coach: CoachClientUser;
  state: InviteLinkState;
  isSelf: boolean;
  /** "invited" = the coach already invited you by username. */
  relationship: "none" | "invited" | "requested" | "active" | "paused";
  relationshipId: string | null;
  /** What the link costs; null/missing = free (ask, and the coach accepts). */
  package?: LinkPackage | null;
  /** The coach can take payments right now. */
  paymentsReady?: boolean;
  /** I already pay this coach through LogIt. */
  paying?: boolean;
  /** A link to ask with a package picked for them (canvas L1). */
  pickedPackageId?: string | null;
  /** The coach's questions (a free link asks them; canvas P2). Missing on older servers. */
  questions?: AskQuestion[];
  spots?: { full: boolean; whenFull: "waitlist" | "stop"; expectSpots: string | null };
  /** My open request's stage, when relationship is "requested". */
  stage?: RequestStage | null;
  /** Already this coach's client: since when (ISO). */
  coachedSince?: string | null;
  /** The coach I already have, if it's someone else (canvas R1). */
  otherCoach?: string | null;
}

/** A client asking to be coached, through a link. */
export interface CoachingRequest {
  relationshipId: string;
  client: CoachClientUser;
  linkName: string | null;
  sharing: Sharing;
  requestedAt: string;
  /** Older servers don't send these: treat missing as "asked" with no answers or offer. */
  stage?: RequestStage;
  answers?: RequestAnswer[];
  interestedPackageId?: string | null;
  waitingSince?: string | null;
  offer?: RequestOffer | null;
}

export interface MyCoachingRequest {
  relationshipId: string;
  coach: CoachClientUser;
  sharing: Sharing;
  requestedAt: string;
  stage?: RequestStage;
  /** A request the coach closed or that was withdrawn (only with includeClosed). */
  closed?: boolean;
  answers?: RequestAnswer[];
  waitingSince?: string | null;
  /** "Expect spots" while on the waiting list. */
  expectSpots?: string | null;
  offer?: RequestOffer | null;
}

/** Taking a spot (canvas J1). */
export interface TakeInfo {
  offer: OfferCard;
  state: OfferState;
  relationshipId: string;
  relationship: "requested" | "active" | "closed";
  coach: CoachClientUser;
  agreement: { text: string; changedAt: string | null } | null;
  agreedAt: string | null;
  sharing: Sharing;
  paymentsReady: boolean;
  /** "This ends coaching with Joe Burke"; paidUntil when coaching with them runs on to then. */
  otherCoach: { name: string; paidUntil: string | null } | null;
  isSample: boolean;
}

/** A closed request in the coach's Closed list (canvas C6). */
export interface ClosedRequest {
  relationshipId: string;
  client: CoachClientUser;
  linkName: string | null;
  stage: RequestStage;
  answers: RequestAnswer[];
  closedAt: string;
}

/** What the ask sheet needs (canvas P2, A4). */
export interface AskInfo {
  coach: CoachClientUser;
  questions: AskQuestion[];
  packages: { id: string; name: string; amountCents: number; currency: string; interval: "month" | "once"; weeks: number | null }[];
  full: boolean;
  whenFull: "waitlist" | "stop";
  expectSpots: string | null;
  isSelf: boolean;
  relationshipId: string | null;
  relationship: "none" | "requested" | "invited" | "active";
  stage: RequestStage | null;
  coachedSince: string | null;
  otherCoach: string | null;
}

/** One submitted check-in in the coach's inbox. `dataJson` is a CheckinSubmission. */
export interface CheckinInboxItem {
  relationshipId: string;
  clientUserId: string;
  id: string;
  scheduleId: string;
  submittedAtMs: number;
  updatedAtMs: number;
  dataJson: string;
  reviewedAtMs: number | null;
}

/** 403 from a coach read of something the client keeps private. */
export function isNotShared(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code === "not_shared";
}

export interface ReceivedInvite {
  relationshipId: string;
  coach: CoachClientUser;
  createdAt: string;
  /** An invite with an offer (canvas K13): take it on the take page. Older invites have none. */
  offer?: { card: OfferCard; state: OfferState } | null;
}

export interface SentInvite {
  relationshipId: string;
  client: CoachClientUser;
  createdAt: string;
}

/** The same calls as `coachApi`, made with another identity (a sandbox sample client's token). */
export function coachApiFor(api: ApiFetcher) {
  return {
    /** With an offer (canvas K13): a package, or null for no payment through LogIt. */
    async inviteClient(username: string, offer?: { packageId: string | null; message?: string }): Promise<{ relationshipId: string; offerId?: string | null }> {
      return api.fetch(`/coach/clients/${username}/invite`, {
        method: "POST",
        ...(offer ? { body: JSON.stringify({ offer: true, packageId: offer.packageId, message: offer.message }) } : {}),
      });
    },

    async listClients(): Promise<ClientRelationship[]> {
      return api.fetch("/coach/clients");
    },

    /** The current user's active coaches (the mirror of listClients). */
    async listCoaches(): Promise<CoachRelationship[]> {
      return api.fetch("/coach/coaches");
    },

    /** Per-client adherence summary for the coach dashboard (Studio-tier only). */
    async getRoster(): Promise<RosterEntry[]> {
      const { roster } = await api.fetch<{ roster: RosterEntry[] }>("/coach/roster");
      return roster;
    },

    async listReceivedInvites(): Promise<ReceivedInvite[]> {
      return api.fetch("/coach/invites/received");
    },

    async listSentInvites(): Promise<SentInvite[]> {
      return api.fetch("/coach/invites/sent");
    },

    /** Accept a coach's invite, choosing what they can see (omitted = everything). */
    async acceptInvite(relationshipId: string, sharing?: Sharing): Promise<void> {
      await api.fetch(`/coach/invites/${relationshipId}/accept`, {
        method: "POST",
        body: JSON.stringify({ sharing: sharing ?? null }),
      });
    },

    /** Client: change what a coach can see. Applies straight away. */
    async updateSharing(relationshipId: string, sharing: Sharing): Promise<Sharing> {
      const res = await api.fetch<{ sharing: Sharing }>(`/coach/relationships/${relationshipId}/sharing`, {
        method: "PUT",
        body: JSON.stringify(sharing),
      });
      return res.sharing;
    },

    // ── Invite links ──

    async createLink(input: { name: string; expiresInDays?: number | null; maxUses?: number | null; packageId?: string | null; payAndStart?: boolean }): Promise<InviteLink> {
      return api.fetch("/coach/links", { method: "POST", body: JSON.stringify(input) });
    },

    /** Change a link, or switch it off (on: false) or on again. */
    async editLink(id: string, input: { name: string; expiresAt: string | null; maxUses: number | null; packageId: string | null; payAndStart: boolean; on: boolean }): Promise<InviteLink> {
      return api.fetch(`/coach/links/${id}`, { method: "PUT", body: JSON.stringify(input) });
    },

    async listLinks(): Promise<InviteLink[]> {
      const { links } = await api.fetch<{ links: InviteLink[] }>("/coach/links");
      return links;
    },

    async turnOffLink(linkId: string): Promise<void> {
      await api.fetch(`/coach/links/${linkId}`, { method: "DELETE" });
    },

    async openLink(code: string): Promise<InviteLinkInfo> {
      return api.fetch(`/coach/links/code/${encodeURIComponent(code)}`);
    },

    async requestCoaching(
      code: string,
      sharing: Sharing,
      answers?: Record<string, string>,
      interestedPackageId?: string | null,
    ): Promise<{ relationshipId: string; status: "requested" | "active"; stage?: RequestStage | null }> {
      return api.fetch(`/coach/links/code/${encodeURIComponent(code)}/request`, {
        method: "POST",
        body: JSON.stringify({ sharing, answers, interestedPackageId }),
      });
    },

    async listRequests(): Promise<CoachingRequest[]> {
      const { requests } = await api.fetch<{ requests: CoachingRequest[] }>("/coach/requests");
      return requests;
    },

    async listMyRequests(includeClosed = false): Promise<MyCoachingRequest[]> {
      const { requests } = await api.fetch<{ requests: MyCoachingRequest[] }>(`/coach/requests/mine${includeClosed ? "?includeClosed=true" : ""}`);
      return requests;
    },

    // ── Asking and answering (canvas P2, R3, C1–C6, A1–A5) ──

    /** Coach: the client limit, when-full rule, "expect spots" and the questions people answer. */
    async getIntake(): Promise<CoachIntake> {
      return api.fetch("/coach/intake");
    },

    async saveIntake(input: { spots: number | null; whenFull: "waitlist" | "stop"; expectSpots: string | null; questions?: AskQuestion[]; resetQuestions?: boolean }): Promise<CoachIntake> {
      return api.fetch("/coach/intake", { method: "PUT", body: JSON.stringify(input) });
    },

    /** Coach: offer a spot, or change the open offer (the old one is replaced). */
    async offerSpot(relationshipId: string, input: OfferInput): Promise<{ offerId: string }> {
      return api.fetch(`/coach/requests/${relationshipId}/offer`, { method: "POST", body: JSON.stringify(input) });
    },

    async withdrawOffer(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/withdraw-offer`, { method: "POST" });
    },

    async putOnWaitingList(relationshipId: string, message: string, expectSpots?: string | null): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/waitlist`, { method: "POST", body: JSON.stringify({ message, expectSpots }) });
    },

    async notAFit(relationshipId: string, message: string, block = false): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/not-a-fit`, { method: "POST", body: JSON.stringify({ message, block }) });
    },

    async reopenRequest(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/reopen`, { method: "POST" });
    },

    async listClosedRequests(): Promise<ClosedRequest[]> {
      const { requests } = await api.fetch<{ requests: ClosedRequest[] }>("/coach/requests/closed");
      return requests;
    },

    /** Someone thinking of asking: the coach's questions, packages, and whether they're full. */
    async askInfo(username: string): Promise<AskInfo> {
      return api.fetch(`/coach/ask/${encodeURIComponent(username)}`);
    },

    /** Ask a coach from their profile. Answers are keyed by question id. */
    async ask(username: string, answers: Record<string, string>, interestedPackageId: string | null, sharing: Sharing): Promise<{ relationshipId: string; status: "requested" | "active"; stage: RequestStage | null }> {
      return api.fetch(`/coach/ask/${encodeURIComponent(username)}`, { method: "POST", body: JSON.stringify({ answers, interestedPackageId, sharing }) });
    },

    /** Withdraw my request, or leave the waiting list. */
    async withdrawMyRequest(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/mine/${relationshipId}/withdraw`, { method: "POST" });
    },

    /** Delete a closed request: my answers go. */
    async deleteMyRequest(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/mine/${relationshipId}`, { method: "DELETE" });
    },

    /** "Stop these emails" from the request-reply email; the link carries the key. */
    async stopRequestEmails(userId: string, token: string): Promise<void> {
      await api.fetch("/email/stop-request-emails", { method: "POST", body: JSON.stringify({ userId, token }) });
    },

    /** What the take page shows (canvas J1). */
    async takeInfo(offerId: string): Promise<TakeInfo> {
      return api.fetch(`/coach/offers/${offerId}`);
    },

    /** Take an offer with no payment through LogIt (a paid one answers 402: pay at checkout). */
    async takeOffer(offerId: string, sharing?: Sharing, agreed = false): Promise<{ relationshipId: string; status: "active" }> {
      return api.fetch(`/coach/offers/${offerId}/take`, { method: "POST", body: JSON.stringify({ sharing, agreed }) });
    },

    /** Pay for an offer on Stripe's page; come back to successUrl with ?session_id=. */
    async checkoutOffer(offerId: string, input: { sharing: Sharing; agreed: boolean; adult: boolean; successUrl: string; cancelUrl: string }): Promise<{ url: string }> {
      return api.fetch(`/coach/offers/${offerId}/checkout`, { method: "POST", body: JSON.stringify(input) });
    },

    /** Back from Stripe: start coaching now rather than waiting for Stripe's webhook. */
    async confirmOfferCheckout(offerId: string, sessionId: string): Promise<{ status: "active" | "pending"; relationshipId?: string }> {
      return api.fetch("/coach/payments/checkout/confirm", { method: "POST", body: JSON.stringify({ offerId, sessionId }) });
    },

    /** The coach's agreement (canvas J4); null text = none. */
    async getAgreement(): Promise<{ text: string | null; changedAt: string | null }> {
      return api.fetch("/coach/agreement");
    },

    async saveAgreement(text: string | null): Promise<{ text: string | null; changedAt: string | null }> {
      return api.fetch("/coach/agreement", { method: "PUT", body: JSON.stringify({ text }) });
    },

    async acceptRequest(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/accept`, { method: "POST" });
    },

    async declineRequest(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/requests/${relationshipId}/decline`, { method: "POST" });
    },

    // ── Check-in inbox ──

    async checkinInbox(days = 120): Promise<CheckinInboxItem[]> {
      const { items } = await api.fetch<{ items: CheckinInboxItem[] }>(`/coach/checkins/inbox?days=${days}`);
      return items;
    },

    async setCheckinReviewed(clientUserId: string, submissionId: string, reviewed: boolean, reply?: string): Promise<number | null> {
      const res = await api.fetch<{ reviewedAtMs: number | null }>("/coach/checkins/reviews", {
        method: "POST",
        body: JSON.stringify({ clientUserId, submissionId, reviewed, ...(reply?.trim() ? { reply: reply.trim() } : {}) }),
      });
      return res.reviewedAtMs;
    },

    /** Client: which of my check-ins a coach has reviewed, with any reply. */
    async myCheckinReviews(): Promise<MyCheckinReview[]> {
      const { reviews } = await api.fetch<{ reviews: MyCheckinReview[] }>("/coach/checkins/reviews/mine");
      return reviews;
    },

    // ── Exercise swaps ──

    /** Coach: the Coaching section of my profile, my packages, and whether it's public yet. */
    async getCoachProfile(): Promise<MyCoachProfile> {
      return api.fetch("/coach/profile");
    },

    /** Saves the Coaching section; `packagesOnProfile` lists the packages shown on it. */
    async saveCoachProfile(profile: CoachProfile, packagesOnProfile: string[]): Promise<MyCoachProfile> {
      return api.fetch("/coach/profile", { method: "PUT", body: JSON.stringify({ profile, packagesOnProfile }) });
    },

    /** Coach: my default swap rule for every client. */
    async getCoachSettings(): Promise<{ swapRule: SwapRule }> {
      return api.fetch("/coach/settings");
    },

    async setDefaultSwapRule(swapRule: SwapRule): Promise<{ swapRule: SwapRule }> {
      return api.fetch("/coach/settings", { method: "PUT", body: JSON.stringify({ swapRule }) });
    },

    /** Coach: set one client differently; null goes back to my default. */
    async setClientSwapRule(relationshipId: string, swapRule: SwapRule | null): Promise<{ swapRule: SwapRule | null }> {
      return api.fetch(`/coach/clients/${relationshipId}/swap-rule`, { method: "PUT", body: JSON.stringify({ swapRule }) });
    },

    async declineInvite(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/invites/${relationshipId}/decline`, { method: "POST" });
    },

    async revokeRelationship(relationshipId: string): Promise<void> {
      await api.fetch(`/coach/relationships/${relationshipId}`, { method: "DELETE" });
    },
  };
}

export const coachApi = coachApiFor(apiClient);
