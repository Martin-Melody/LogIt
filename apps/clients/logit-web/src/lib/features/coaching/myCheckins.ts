import { coachApi, type CoachRelationship } from "@logit/core/api/coachApi";
import { checkinRows, type CheckinReviewInfo, type CheckinRow, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
import { loadAssignedForms, loadMySubmissions } from "./myCoachData";

/** Everything the client's check-in pages need: forms, submissions, reviews (with replies)
 * and coaches (to name who reviewed). */
export type MyCheckins = {
  forms: CheckinSchedule[];
  subs: CheckinSubmission[];
  reviews: Map<string, CheckinReviewInfo>;
  coaches: CoachRelationship[];
  current: CheckinRow[];
  earlier: CheckinRow[];
};

export async function loadMyCheckins(): Promise<MyCheckins> {
  const [forms, subs, reviewList, coaches] = await Promise.all([
    loadAssignedForms(),
    loadMySubmissions(),
    coachApi.myCheckinReviews().catch(() => []),
    coachApi.listCoaches().catch(() => []),
  ]);
  const reviews = new Map<string, CheckinReviewInfo>(
    reviewList.map((r) => [r.submissionId, { reviewedAtMs: r.reviewedAtMs, reply: r.reply ?? null, coachId: r.coachId }]),
  );
  // Only forms still assigned are listed (with everything sent on them).
  const { current, earlier } = checkinRows(forms, subs, reviews);
  return { forms, subs, reviews, coaches, current, earlier };
}

export function coachNameFor(coaches: CoachRelationship[], coachId: string | undefined): string {
  const c = coaches.find((x) => x.coach.id === coachId) ?? (coaches.length === 1 ? coaches[0] : undefined);
  return c ? c.coach.displayName || c.coach.username : "Your coach";
}
