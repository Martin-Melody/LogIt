import { coachApi } from "@logit/core/api/coachApi";
import { messagesApi } from "@logit/core/api/messagesApi";
import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
import { loadCoachingOverview, needsYou, type CoachingOverview } from "./coachingData";

/** The counts on the sidebar: what's waiting for you as a coach, and from your own coach. */
const counts = $state({ today: 0, checkins: 0, messages: 0, links: 0, myCoach: 0, payments: 0 });

let lastLoad = 0;
let studio = false;

export const coachBadges = {
  get today() { return counts.today; },
  get checkins() { return counts.checkins; },
  get messages() { return counts.messages; },
  get links() { return counts.links; },
  get myCoach() { return counts.myCoach; },
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
    counts.links = o.requests.length;
  },

  /** Re-count, at most every 30 s unless forced. Never throws: badges are a nicety. */
  async refresh(isStudio?: boolean, force = false) {
    if (isStudio !== undefined) studio = isStudio;
    if (!force && Date.now() - lastLoad < 30_000) return;
    lastLoad = Date.now();
    try {
      const [overview, unread, coaches, invites, payments] = await Promise.all([
        studio ? loadCoachingOverview().catch(() => null) : Promise.resolve(null),
        messagesApi.unreadCounts().catch(() => []),
        coachApi.listCoaches().catch(() => []),
        coachApi.listReceivedInvites().catch(() => []),
        studio ? coachPaymentsApi.overview().catch(() => null) : Promise.resolve(null),
      ]);
      if (overview) this.fromOverview(overview);
      if (payments) counts.payments = payments.summary.problems;
      const coachThreads = new Set(coaches.map((c) => c.relationshipId));
      counts.myCoach =
        unread.filter((u) => coachThreads.has(u.relationshipId)).reduce((n, u) => n + u.unread, 0) + invites.length;
    } catch {
      /* keep the old counts */
    }
  },
};
