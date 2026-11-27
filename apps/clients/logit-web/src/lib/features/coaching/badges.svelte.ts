import { coachTrial } from "$lib/workspace";
import { coachApi } from "@logit/core/api/coachApi";
import { messagesApi } from "@logit/core/api/messagesApi";
import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
import { loadCoachingOverview, needsYou, type CoachingOverview } from "./coachingData";

/** The counts on the sidebar: what's waiting for you as a coach, and from your own coach. */
const counts = $state({ today: 0, checkins: 0, messages: 0, requests: 0, myCoach: 0, myCoachMessages: 0, payments: 0 });

let lastLoad = 0;
let studio = false;

export const coachBadges = {
  get today() { return counts.today; },
  get checkins() { return counts.checkins; },
  get messages() { return counts.messages; },
  /** Requests waiting for an answer (asked, or the offer ran out): Clients › Requests. */
  get requests() { return counts.requests; },
  /** Coaches inviting you (My coach). */
  get myCoach() { return counts.myCoach; },
  /** Unread from your own coaches and coaches you asked: counted in Me › Messages, where those chats are. */
  get myCoachMessages() { return counts.myCoachMessages; },
  get payments() { return counts.payments; },

  /** The Payments page passes its count of clients who aren't paid up. */
  setPayments(n: number) {
    counts.payments = n;
  },

  /** Pages that already loaded the overview pass it here instead of loading it again. */
  fromOverview(o: CoachingOverview) {
    counts.today = needsYou(o).length;
    counts.checkins = o.clients.reduce((n, c) => n + c.toReview.length, 0);
    counts.messages = o.clients.reduce((n, c) => n + c.unread, 0);
    counts.requests = needsYou(o).filter((i) => i.kind === "request").length;
  },

  /** Re-count, at most every 30 s unless forced. Never throws: badges are a nicety. */
  async refresh(isStudio?: boolean, force = false) {
    if (isStudio !== undefined) studio = isStudio;
    if (!force && Date.now() - lastLoad < 30_000) return;
    lastLoad = Date.now();
    try {
      const [overview, unread, coaches, invites, payments, asked] = await Promise.all([
        studio ? loadCoachingOverview().catch(() => null) : Promise.resolve(null),
        messagesApi.unreadCounts().catch(() => []),
        coachApi.listCoaches().catch(() => []),
        coachApi.listReceivedInvites().catch(() => []),
        // Payments are Studio-only: an account trying coaching with samples doesn't ask.
        studio && !coachTrial() ? coachPaymentsApi.overview().catch(() => null) : Promise.resolve(null),
        coachApi.listMyRequests().catch(() => []),
      ]);
      if (overview) this.fromOverview(overview);
      if (payments) counts.payments = payments.summary.problems;
      const mine = new Set([...coaches.map((c) => c.relationshipId), ...asked.map((r) => r.relationshipId)]);
      counts.myCoachMessages = unread.filter((u) => mine.has(u.relationshipId)).reduce((n, u) => n + u.unread, 0);
      counts.myCoach = invites.length;
    } catch {
      /* keep the old counts */
    }
  },
};
