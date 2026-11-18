/**
 * Right after signing in on a phone, the account's training is still on its way down from the
 * server. Home and Nutrition show that ("loading", or "failed" when the server couldn't be
 * reached) instead of empty states that read as if the data were gone. Later syncs only get a
 * small "Updating…" in the header (SyncIndicator.svelte).
 */
export type FirstDownload = "loading" | "failed" | null;

export function firstDownloadState(opts: {
  /** Signed in to an account. */
  signedIn: boolean;
  /** The account's plan brings data down to this phone (planIncludesSync()). */
  syncs: boolean;
  /** firstDownloadAt: when it first arrived here, 0 = not yet. */
  downloadedAt: number;
  running: boolean;
  failed: boolean;
}): FirstDownload {
  if (!opts.signedIn || !opts.syncs || opts.downloadedAt > 0) return null;
  // A retry that's under way is loading again, not still failed.
  return opts.failed && !opts.running ? "failed" : "loading";
}
