/**
 * Run `cb` whenever the app/tab comes back to the foreground (tab re-shown, or the
 * native app resumed from background). Returns a cleanup function — call it on unmount,
 * or return it straight from `onMount`.
 *
 * Used by screens that load a snapshot once and would otherwise go stale while the app
 * sits backgrounded — most visibly anything scoped to "today", which silently keeps
 * showing yesterday after midnight until the component re-mounts.
 */
export function onForeground(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
