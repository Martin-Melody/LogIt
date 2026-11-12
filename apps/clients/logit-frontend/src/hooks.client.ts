import type { HandleClientError } from "@sveltejs/kit";
import { log } from "@logit/core/platform/log";

/** Errors thrown while loading or rendering a page. SvelteKit shows its error page; this makes
 * sure the cause is in the diagnostics log too. */
export const handleError: HandleClientError = ({ error, status, message, event }) => {
  log.error("crash", `Page error (${status}): ${message}`, {
    route: event.route.id ?? event.url.pathname,
    error,
  });
  return { message };
};
