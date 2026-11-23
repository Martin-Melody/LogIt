/** The account screens, which the app never redirects away from on its own. */
export function isAccountScreen(path: string): boolean {
  return path.startsWith("/onboarding") || path.startsWith("/auth") || path.startsWith("/accounts");
}

/**
 * Where the root layout sends someone once the app has started, or null to stay put.
 * Needing to sign in beats unfinished onboarding (the layout used to fire both redirects and
 * the second one won).
 */
export function launchRedirect(s: {
  ready: boolean;
  onboardingCompleted: boolean;
  needsAccountAuth: boolean;
  path: string;
}): string | null {
  if (!s.ready || isAccountScreen(s.path)) return null;
  if (s.needsAccountAuth) return "/auth";
  // The plans page is part of onboarding for a coach ("See the Studio plan").
  if (!s.onboardingCompleted && !s.path.startsWith("/plans")) return "/onboarding";
  return null;
}
