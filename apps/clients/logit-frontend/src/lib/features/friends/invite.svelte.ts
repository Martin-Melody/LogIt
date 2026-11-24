// When the "Invite a friend" sheet (design canvas T3) is open. Offered once, after a finished
// workout while signed in (not on top of onboarding's next step); always reachable from
// Social › Find people.
import { authStore } from "$lib/api/authStore.svelte";

const OFFERED_KEY = "logit:friend-invite-offered";

export const inviteSheet = $state({ open: false });

export function openInvite(): void {
  inviteSheet.open = true;
}

/** After a finished workout: the first time only. */
export function offerInviteOnce(): void {
  if (!authStore.isAuthenticated || localStorage.getItem(OFFERED_KEY)) return;
  localStorage.setItem(OFFERED_KEY, "1");
  inviteSheet.open = true;
}

const HELD_KEY = "logit:friend-invite-held";

/** An invite opened before signing up: kept through sign-up and onboarding, then reopened. */
export function holdInvite(c: string): void {
  localStorage.setItem(HELD_KEY, c);
}

/** The held invite's page once the account is ready, or null. Clears it. */
export function takeHeldInvite(): string | null {
  const c = localStorage.getItem(HELD_KEY);
  if (!c) return null;
  localStorage.removeItem(HELD_KEY);
  return `/social/invite?c=${encodeURIComponent(c)}`;
}
