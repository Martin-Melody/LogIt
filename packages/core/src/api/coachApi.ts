import { ApiError, apiClient } from "./client";
import type { SwapRule } from "../domain/swaps";
import type { ClientPayment, LinkPackage } from "../domain/coachPayments";

export interface CoachClientUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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

export type InviteLinkState = "active" | "off" | "expired" | "full";

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
  /** The package people pay for through this link; null = a free link. */
  packageId?: string | null;
  packageName?: string | null;
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
}

/** A client asking to be coached, through a link. */
export interface CoachingRequest {
  relationshipId: string;
  client: CoachClientUser;
  linkName: string | null;
  sharing: Sharing;
  requestedAt: string;
}

export interface MyCoachingRequest {
  relationshipId: string;
  coach: CoachClientUser;
  sharing: Sharing;
  requestedAt: string;
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
}

export interface SentInvite {
  relationshipId: string;
  client: CoachClientUser;
  createdAt: string;
}

export const coachApi = {
  async inviteClient(username: string): Promise<void> {
    await apiClient.fetch(`/coach/clients/${username}/invite`, { method: "POST" });
  },

  async listClients(): Promise<ClientRelationship[]> {
    return apiClient.fetch("/coach/clients");
  },

  /** The current user's active coaches (the mirror of listClients). */
  async listCoaches(): Promise<CoachRelationship[]> {
    return apiClient.fetch("/coach/coaches");
  },

  /** Per-client adherence summary for the coach dashboard (Studio-tier only). */
  async getRoster(): Promise<RosterEntry[]> {
    const { roster } = await apiClient.fetch<{ roster: RosterEntry[] }>("/coach/roster");
    return roster;
  },

  async listReceivedInvites(): Promise<ReceivedInvite[]> {
    return apiClient.fetch("/coach/invites/received");
  },

  async listSentInvites(): Promise<SentInvite[]> {
    return apiClient.fetch("/coach/invites/sent");
  },

  /** Accept a coach's invite, choosing what they can see (omitted = everything). */
  async acceptInvite(relationshipId: string, sharing?: Sharing): Promise<void> {
    await apiClient.fetch(`/coach/invites/${relationshipId}/accept`, {
      method: "POST",
      body: JSON.stringify({ sharing: sharing ?? null }),
    });
  },

  /** Client: change what a coach can see. Applies straight away. */
  async updateSharing(relationshipId: string, sharing: Sharing): Promise<Sharing> {
    const res = await apiClient.fetch<{ sharing: Sharing }>(`/coach/relationships/${relationshipId}/sharing`, {
      method: "PUT",
      body: JSON.stringify(sharing),
    });
    return res.sharing;
  },

  // ── Invite links ──

  async createLink(input: { name: string; expiresInDays?: number | null; maxUses?: number | null; packageId?: string | null }): Promise<InviteLink> {
    return apiClient.fetch("/coach/links", { method: "POST", body: JSON.stringify(input) });
  },

  async listLinks(): Promise<InviteLink[]> {
    const { links } = await apiClient.fetch<{ links: InviteLink[] }>("/coach/links");
    return links;
  },

  async turnOffLink(linkId: string): Promise<void> {
    await apiClient.fetch(`/coach/links/${linkId}`, { method: "DELETE" });
  },

  async openLink(code: string): Promise<InviteLinkInfo> {
    return apiClient.fetch(`/coach/links/code/${encodeURIComponent(code)}`);
  },

  async requestCoaching(code: string, sharing: Sharing): Promise<{ relationshipId: string; status: "requested" | "active" }> {
    return apiClient.fetch(`/coach/links/code/${encodeURIComponent(code)}/request`, {
      method: "POST",
      body: JSON.stringify({ sharing }),
    });
  },

  async listRequests(): Promise<CoachingRequest[]> {
    const { requests } = await apiClient.fetch<{ requests: CoachingRequest[] }>("/coach/requests");
    return requests;
  },

  async listMyRequests(): Promise<MyCoachingRequest[]> {
    const { requests } = await apiClient.fetch<{ requests: MyCoachingRequest[] }>("/coach/requests/mine");
    return requests;
  },

  async acceptRequest(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/requests/${relationshipId}/accept`, { method: "POST" });
  },

  async declineRequest(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/requests/${relationshipId}/decline`, { method: "POST" });
  },

  // ── Check-in inbox ──

  async checkinInbox(days = 120): Promise<CheckinInboxItem[]> {
    const { items } = await apiClient.fetch<{ items: CheckinInboxItem[] }>(`/coach/checkins/inbox?days=${days}`);
    return items;
  },

  async setCheckinReviewed(clientUserId: string, submissionId: string, reviewed: boolean, reply?: string): Promise<number | null> {
    const res = await apiClient.fetch<{ reviewedAtMs: number | null }>("/coach/checkins/reviews", {
      method: "POST",
      body: JSON.stringify({ clientUserId, submissionId, reviewed, ...(reply?.trim() ? { reply: reply.trim() } : {}) }),
    });
    return res.reviewedAtMs;
  },

  /** Client: which of my check-ins a coach has reviewed, with any reply. */
  async myCheckinReviews(): Promise<MyCheckinReview[]> {
    const { reviews } = await apiClient.fetch<{ reviews: MyCheckinReview[] }>("/coach/checkins/reviews/mine");
    return reviews;
  },

  // ── Exercise swaps ──

  /** Coach: my default swap rule for every client. */
  async getCoachSettings(): Promise<{ swapRule: SwapRule }> {
    return apiClient.fetch("/coach/settings");
  },

  async setDefaultSwapRule(swapRule: SwapRule): Promise<{ swapRule: SwapRule }> {
    return apiClient.fetch("/coach/settings", { method: "PUT", body: JSON.stringify({ swapRule }) });
  },

  /** Coach: set one client differently; null goes back to my default. */
  async setClientSwapRule(relationshipId: string, swapRule: SwapRule | null): Promise<{ swapRule: SwapRule | null }> {
    return apiClient.fetch(`/coach/clients/${relationshipId}/swap-rule`, { method: "PUT", body: JSON.stringify({ swapRule }) });
  },

  async declineInvite(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/invites/${relationshipId}/decline`, { method: "POST" });
  },

  async revokeRelationship(relationshipId: string): Promise<void> {
    await apiClient.fetch(`/coach/relationships/${relationshipId}`, { method: "DELETE" });
  },
};
