// The Following feed and Discover shown together: newest posts from people you follow, then
// "You're all caught up" and suggested posts, then (on request) older posts you follow.

/** Posts newer than this count as "new" in the Following feed. */
export const CAUGHT_UP_DAYS = 3;

/** Where "You're all caught up" goes in a Following feed (newest first): before the first
 * post older than `days` (0 when nothing is new), or after the last post once there are no
 * more pages. Null while every loaded post is new and more pages may follow: load more first. */
export function caughtUpIndex(
  posts: { createdAt: string }[],
  hasMore: boolean,
  nowMs: number,
  days = CAUGHT_UP_DAYS,
): number | null {
  const cutoff = nowMs - days * 86_400_000;
  const i = posts.findIndex((p) => Date.parse(p.createdAt) < cutoff);
  if (i >= 0) return i;
  return hasMore ? null : posts.length;
}

/** Adds a page of posts, skipping any already shown (Discover pages are ranked, so a post can
 * move between pages as likes come in). */
export function appendUnique<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const ids = new Set(shown.map((p) => p.id));
  return [...shown, ...page.filter((p) => !ids.has(p.id))];
}

export type FeedItem<P, F> = { kind: "post"; post: P; at: number } | { kind: "forum"; post: F; at: number };

/** The Following feed's posts with forum title cards (canvas F1) slotted in by time, newest
 * first; a card that came with more than one page shows once. */
export function withForumCards<P extends { createdAt: string }, F extends { id: string; createdAtMs: number }>(posts: P[], cards: F[]): FeedItem<P, F>[] {
  const seen = new Set<string>();
  const forum = cards.filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ kind: "forum" as const, post: c, at: c.createdAtMs }));
  return [...posts.map((p) => ({ kind: "post" as const, post: p, at: Date.parse(p.createdAt) })), ...forum].sort((a, b) => b.at - a.at);
}
