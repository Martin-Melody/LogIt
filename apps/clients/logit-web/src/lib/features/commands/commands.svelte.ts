import type { ClientSummary } from "$lib/features/coaching/coachingData";
import type { PersonRow } from "$lib/features/admin/adminApi";
import { toast } from "$lib/components/ui/sonner";
import { coachCan, type RequestOffer, type RequestStage } from "@logit/core/domain/coachRequest";

/** Open state of ⌘K and the shortcuts list, so the sidebar button and the keys share it. */
export const commands = $state({ palette: false, shortcuts: false });

export type RowAction = {
  id: string;
  label: string;
  /** Where it goes; an action without one runs `run` instead. */
  href?: string;
  run?: () => void;
  danger?: boolean;
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
    // Canvas W3.
    { id: "next-block", label: "Plan the next block…", href: `${page}/next-block`, disabled: c.program ? undefined : "Not on a program from you" },
    { id: "training", label: "See their training", href: `${page}?tab=training`, disabled: c.sharing.workouts ? undefined : "Not shared" },
    {
      id: "checkin",
      label: "Review their check-in",
      href: review ? `/coaching/checkins?id=${encodeURIComponent(review.id)}&client=${c.id}` : `${page}?tab=checkins`,
      disabled: review ? undefined : !c.sharing.checkins ? "Not shared" : c.scheduleCount ? "Nothing to review" : "No check-in form",
    },
    // Canvas V2: a sample can be answered for, to try a reply or a conversation.
    ...(c.isSample ? [{ id: "answer-as", label: `Answer as ${c.name}…`, href: `${page}?answer=1` }] : []),
    // Canvas E1: last, in red.
    { id: "end", label: "Pause or end coaching…", href: `${page}?end=1`, danger: true, separatorBefore: true, disabled: c.isSample ? "A sample client" : undefined },
  ];
}

/** What the coach's request dialogs open with (Clients › Requests). */
export type RequestRunners = {
  offer: () => void;
  waitlist: () => void;
  notAFit: () => void;
  withdrawOffer: () => void;
  reopen: () => void;
};

/**
 * Everything a coach can do with a request (canvas C1, C4, C6, X2): an open request, one with an
 * offer out, a waiting-list entry or a closed one. What fits the moment comes from coachCan.
 */
export function requestActions(
  r: { relationshipId: string; name: string; stage: RequestStage; offer: RequestOffer | null },
  run: RequestRunners,
  nowMs = Date.now(),
): RowAction[] {
  const can = coachCan(r.stage, r.offer, nowMs);
  const closed = r.stage === "notafit" || r.stage === "withdrawn";
  const list: RowAction[] = [
    { id: "open", label: `Open ${r.name}'s request`, href: `/clients?tab=${r.stage === "waiting" ? "waiting" : "requests"}${closed ? "&view=closed" : ""}&r=${r.relationshipId}` },
  ];
  if (closed) {
    list.push({ id: "reopen", label: "Reopen the request", run: run.reopen, separatorBefore: true });
    return list;
  }
  if (can.editOffer) list.push({ id: "edit-offer", label: "Edit the offer…", run: run.offer, separatorBefore: true });
  else list.push({ id: "offer", label: can.offerAgain ? "Offer the spot again…" : "Offer a spot…", run: run.offer, separatorBefore: true });
  if (can.withdrawOffer) list.push({ id: "withdraw-offer", label: "Withdraw the offer", run: run.withdrawOffer });
  if (can.waitlist) list.push({ id: "waitlist", label: "Put on the waiting list…", run: run.waitlist });
  list.push({ id: "not-a-fit", label: r.stage === "waiting" ? "Remove from the waiting list…" : "Not a fit…", run: run.notAFit, danger: true, separatorBefore: true });
  return list;
}

/** ⌘ on Apple keyboards, Ctrl elsewhere. */
export const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/** A key typed into a box is text, not a shortcut. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** "." (no modifiers), Shift+F10 or the Menu key: open the action menu of what has focus. */
export function isMenuKey(e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  if (e.key === "." && !e.ctrlKey && !e.metaKey && !e.altKey) return true;
  return (e.key === "F10" && e.shiftKey) || e.key === "ContextMenu";
}

/**
 * What's wrong with an action list, against the menu rules (canvas X4): ids unique; every
 * action goes somewhere or does something; nothing above the first item's line; red items
 * only at the end, after a line; a greyed item says why in a few words.
 */
export function actionListProblems(list: RowAction[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  list.forEach((a, i) => {
    if (ids.has(a.id)) problems.push(`"${a.id}" is listed twice`);
    ids.add(a.id);
    if (!a.href && !a.run) problems.push(`"${a.label}" does nothing`);
    if (i === 0 && a.separatorBefore) problems.push("the list starts with a line");
    if (i === 0 && a.danger) problems.push(`"${a.label}" is red and first`);
    if (a.danger && i > 0 && !list[i - 1]!.danger && !a.separatorBefore) problems.push(`"${a.label}" is red without a line above it`);
    if (a.danger && list.slice(i + 1).some((b) => !b.danger)) problems.push(`"${a.label}" is red but not at the end`);
    if (a.disabled !== undefined && (a.disabled.trim() === "" || a.disabled.length > 30)) problems.push(`"${a.label}" is greyed without a short reason`);
    if (/[.!]$/.test(a.label)) problems.push(`"${a.label}" ends with punctuation`);
  });
  return problems;
}

/** Admin: everything you can do to an account from People's ⋯ menu, right-click, or ⌘K.
 * Anything that changes the account opens their page with the question already asked. */
export function personActions(p: PersonRow, meId: string | undefined): RowAction[] {
  const page = `/admin/people?id=${p.id}`;
  const name = p.displayName || p.username;
  return [
    { id: "open", label: `Open ${name}`, href: page },
    { id: "reset", label: "Make a temporary password…", href: `${page}&do=reset`, separatorBefore: true },
    { id: "signout", label: "Sign out everywhere…", href: `${page}&do=signout` },
    {
      id: "email",
      label: "Copy their email",
      run: () => void navigator.clipboard.writeText(p.email).then(() => toast.success("Email copied"), () => toast.error("Couldn't copy it")),
    },
    {
      id: "admin",
      label: p.isAdmin ? (p.id === meId ? "Stop being an admin…" : `Remove ${name} as an admin…`) : `Make ${name} an admin…`,
      href: `${page}&do=admin`,
      separatorBefore: true,
    },
    { id: "delete", label: "Delete account…", href: `${page}&do=delete`, danger: true, separatorBefore: true },
  ];
}
