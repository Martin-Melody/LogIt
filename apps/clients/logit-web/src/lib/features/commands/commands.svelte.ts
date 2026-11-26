import type { ClientSummary } from "$lib/features/coaching/coachingData";

/** Open state of ⌘K and the shortcuts list, so the sidebar button and the keys share it. */
export const commands = $state({ palette: false, shortcuts: false });

export type RowAction = {
  id: string;
  label: string;
  href: string;
  /** Why it can't run right now; shown in grey instead of hiding the action. */
  disabled?: string;
  separatorBefore?: boolean;
};

/** Everything you can do to a client from a row's ⋯ menu, right-click, or ⌘K: one list. */
export function clientActions(c: ClientSummary): RowAction[] {
  const page = `/clients/${c.id}`;
  const review = c.toReview[0];
  return [
    { id: "open", label: `Open ${c.name}`, href: page },
    { id: "message", label: `Message ${c.name}`, href: `/messages?c=${c.relationshipId}` },
    { id: "assign", label: "Assign a program…", href: `${page}?assign=1`, separatorBefore: true },
    { id: "training", label: "See their training", href: `${page}?tab=training`, disabled: c.sharing.workouts ? undefined : "Not shared" },
    {
      id: "checkin",
      label: "Review their check-in",
      href: review ? `/coaching/checkins?id=${encodeURIComponent(review.id)}&client=${c.id}` : `${page}?tab=checkins`,
      disabled: review ? undefined : !c.sharing.checkins ? "Not shared" : c.scheduleCount ? "Nothing to review" : "No check-in form",
    },
  ];
}

/** ⌘ on Apple keyboards, Ctrl elsewhere. */
export const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/** A key typed into a box is text, not a shortcut. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
