import type { DmReaction } from "../api/dmApi";

/** The emoji you'd pick next when tapping `emoji` on a message: the same one again takes it back. */
export function nextReaction(list: DmReaction[] | null | undefined, emoji: string): string | null {
  return list?.find((r) => r.mine)?.emoji === emoji ? null : emoji;
}

/** A message's reactions after you change yours to `next` (null = take it back), for showing it
 * straight away while the server catches up. One reaction per person, like Instagram. */
export function withMyReaction(list: DmReaction[] | null | undefined, next: string | null): DmReaction[] | null {
  const out = (list ?? [])
    .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
    .filter((r) => r.count > 0);
  if (next) {
    const i = out.findIndex((r) => r.emoji === next);
    if (i >= 0) out[i] = { ...out[i]!, count: out[i]!.count + 1, mine: true };
    else out.push({ emoji: next, count: 1, mine: true });
  }
  return out.length ? out : null;
}
