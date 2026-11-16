import type { MyPlugin, MyPluginRelease, ReleaseStatus } from "@logit/core/api/pluginsApi";

/** Labels and helpers for the plugins you build. */

export const STATUS_LABEL: Record<ReleaseStatus, string> = {
  pending: "Waiting for review",
  approved: "Listed",
  rejected: "Changes asked",
  unlisted: "Shared by link",
  withdrawn: "Replaced",
};

const TONE: Record<ReleaseStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unlisted: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

/** The newest version that isn't a replaced submission (releases come newest first). */
export function latestStatus(p: Pick<MyPlugin, "releases">): { release: MyPluginRelease; tone: string } | null {
  const release = p.releases.find((r) => r.status !== "withdrawn");
  return release ? { release, tone: TONE[release.status] } : null;
}

function parts(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Is `a` a later version than `b`? Numbers, not text: 1.10.0 is after 1.9.0. */
export function versionAfter(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! > y[i]!;
  return false;
}

/** The version to suggest when publishing: one patch after the newest, else 1.0.0. */
export function nextVersion(p: Pick<MyPlugin, "releases">): string {
  let best: [number, number, number] | null = null;
  for (const r of p.releases) {
    const v = parts(r.version);
    if (v && (!best || versionAfter(r.version, best.join(".")))) best = v;
  }
  return best ? `${best[0]}.${best[1]}.${best[2] + 1}` : "1.0.0";
}
