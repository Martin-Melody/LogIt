import { apiClient } from "@logit/core/api/client";
import { coachApi } from "@logit/core/api/coachApi";
import { isSwapRule, type SwapRule } from "@logit/core/domain/swaps";
import type { CheckinReviewInfo } from "@logit/core/domain/Checkin";
import { getActiveOwnerId } from "$lib/data/activeOwner";

// What the phone needs to know about the user's coaches while offline: who they are (to
// message them), and the swap rule each one set for them. Plus the coaches' reviews of
// their check-ins, with any reply. Refreshed on every sync; read from here everywhere else.

export type CachedCoach = { relationshipId: string; coachId: string; name: string; swapRule: SwapRule };

const key = (what: string) => `logit:coaching:${what}:v1:${getActiveOwnerId() ?? "local"}`;

function read<T>(what: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(what));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(what: string, value: unknown): void {
  try {
    localStorage.setItem(key(what), JSON.stringify(value));
  } catch {
    /* storage full or blocked: the next sync tries again */
  }
}

export function cachedCoaches(): CachedCoach[] {
  return read<CachedCoach[]>("coaches", []);
}

/** A workout's coach: by id, or the only coach when the workout doesn't say (programs and
 * workouts from before the app knew which coach a program came from). */
export function coachFor(coachId: string | undefined): CachedCoach | undefined {
  const all = cachedCoaches();
  return (coachId ? all.find((c) => c.coachId === coachId) : undefined) ?? (all.length === 1 ? all[0] : undefined);
}

export async function refreshCoaches(): Promise<boolean> {
  if (!apiClient.isAuthenticated()) return true;
  try {
    const [coaches, reviews] = await Promise.all([coachApi.listCoaches(), coachApi.myCheckinReviews()]);
    // A paused coach (not paid up) can't message or send programs, so the app leaves them out.
    write("coaches", coaches.filter((c) => c.status !== "paused").map((c): CachedCoach => ({
      relationshipId: c.relationshipId,
      coachId: c.coach.id,
      name: c.coach.displayName || c.coach.username,
      swapRule: isSwapRule(c.swapRule) ? c.swapRule : "any",
    })));
    write("reviews", reviews.map((r) => [r.submissionId, { reviewedAtMs: r.reviewedAtMs, reply: r.reply ?? null, coachId: r.coachId }]));
    return true;
  } catch {
    return false;
  }
}

export function cachedReviews(): Map<string, CheckinReviewInfo> {
  return new Map(read<[string, CheckinReviewInfo][]>("reviews", []));
}
