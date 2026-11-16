// Instagram-style comment threads: replies sit under the comment they answer, one level deep
// (the server files a reply to a reply under the same top-level comment). A thread with more
// than REPLY_COLLAPSE_AFTER replies starts folded behind "View N replies".

export interface ThreadableComment {
  id: string;
  parentCommentId?: string | null;
  authorUsername: string;
}

export interface CommentThread<T extends ThreadableComment> {
  comment: T;
  replies: T[];
}

export const REPLY_COLLAPSE_AFTER = 3;

/** Groups a flat list (top-level comments and their replies, in server order) into threads.
 * A reply whose comment isn't in the list (deleted meanwhile) is shown as its own thread so it
 * never silently disappears. */
export function threadComments<T extends ThreadableComment>(comments: readonly T[]): CommentThread<T>[] {
  const threads: CommentThread<T>[] = [];
  const byId = new Map<string, CommentThread<T>>();
  for (const c of comments) {
    if (c.parentCommentId) continue;
    const thread = { comment: c, replies: [] as T[] };
    threads.push(thread);
    byId.set(c.id, thread);
  }
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const parent = byId.get(c.parentCommentId);
    if (parent) parent.replies.push(c);
    else threads.push({ comment: c, replies: [] });
  }
  return threads;
}

/** Whether a thread's replies start folded. */
export function repliesStartFolded(replyCount: number): boolean {
  return replyCount > REPLY_COLLAPSE_AFTER;
}

/** The thread (top-level comment id) a reply to `target` lands in. */
export function threadIdFor(target: ThreadableComment): string {
  return target.parentCommentId ?? target.id;
}

/** Starts a reply with "@username " (Instagram does the same), keeping anything already typed
 * and not doubling the mention. */
export function replyDraft(target: ThreadableComment, draft: string): string {
  const tag = `@${target.authorUsername}`;
  const rest = draft.trimStart();
  if (rest.toLowerCase().startsWith(tag.toLowerCase())) return rest;
  return `${tag} ${rest}`;
}

/** How many comments a delete removes (a top-level comment takes its replies with it). */
export function removedByDelete<T extends ThreadableComment>(comments: readonly T[], id: string): string[] {
  return comments.filter((c) => c.id === id || c.parentCommentId === id).map((c) => c.id);
}
