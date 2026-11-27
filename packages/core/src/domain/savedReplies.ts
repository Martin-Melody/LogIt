// A coach's saved replies (canvas W10): snippets typed with "/" in a message box. Plain text,
// with {first name}, {exercise} and {coach name} filled in when one is used.

export type SavedReply = { id: string; shortcut: string; title: string; body: string };

/** The replies a "/swa" in the box points at: shortcut first, then title. */
export function matchReplies(replies: SavedReply[], typed: string): SavedReply[] {
  const q = typed.replace(/^\//, "").trim().toLowerCase();
  if (!q) return replies;
  const starts = replies.filter((r) => r.shortcut.toLowerCase().startsWith(q));
  const rest = replies.filter((r) => !starts.includes(r) && (r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)));
  return [...starts, ...rest];
}

/** The text that goes in the box. A fill-in with nothing to put in stays, so it's seen and edited. */
export function fillReply(body: string, fill: { firstName?: string | null; exercise?: string | null; coachName?: string | null }): string {
  return body
    .replace(/\{first name\}/gi, (m) => fill.firstName || m)
    .replace(/\{exercise\}/gi, (m) => fill.exercise || m)
    .replace(/\{coach name\}/gi, (m) => fill.coachName || m);
}

/** "/sw" at the start of the box, with nothing after the word yet: show the list. */
export function slashQuery(draft: string): string | null {
  const m = /^\/(\S*)$/.exec(draft);
  return m ? m[1]! : null;
}

/** Ready-made replies a coach starts with (the canvas examples), until they write their own. */
export const STARTER_REPLIES: Omit<SavedReply, "id">[] = [
  { shortcut: "swap", title: "Swap is fine", body: "Yep, {exercise} for now, same sets and reps. I'll update your program." },
  { shortcut: "sick", title: "Missed sessions, ill", body: "No stress {first name}, rest up. We'll pick up where you left off." },
  { shortcut: "protein", title: "Protein tips", body: "Easy wins: a protein main at every meal, a shake after training, Greek yogurt or cottage cheese as a snack." },
  { shortcut: "welcome", title: "Welcome", body: "Welcome aboard {first name}! Fill in the start-up form when you get a minute and I'll have your program ready in a day or two." },
];
