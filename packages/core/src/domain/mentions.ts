// @username mentions in post/comment bodies — parsed client-side for rendering (MentionText.svelte)
// and matched server-side (Notifications.cs) for the actual "who gets notified" logic; keep the
// two patterns in sync if this changes.
export type TextSegment = { type: "text"; value: string } | { type: "mention"; username: string };

// Negative lookbehind excludes the common false-positive of matching mid-email-address
// ("user@example.com" shouldn't linkify "@example"). Username charset is intentionally
// permissive (no format is actually enforced at signup) — a real, non-mention "@" followed by
// something that happens to look like a username is a rare, low-stakes miss either way.
const MENTION_RE = /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_]{1,32})/g;

export function parseMentions(body: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index;
    if (start > lastIndex) segments.push({ type: "text", value: body.slice(lastIndex, start) });
    segments.push({ type: "mention", username: match[1]! });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) segments.push({ type: "text", value: body.slice(lastIndex) });
  return segments;
}
