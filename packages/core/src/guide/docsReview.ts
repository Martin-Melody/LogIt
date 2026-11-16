// Which docs pages to re-read after a change. No check can tell whether hand-written docs
// prose is still true, so when a pull request changes a feature's pages but not its docs
// page, CI leaves a warning on the pull request naming the page (docsReview.test.ts). It
// never fails the build: often nothing in the docs needs to change.
import { FEATURES } from "./features";

const APPS: { prefix: string; key: "web" | "phone" }[] = [
  { prefix: "apps/clients/logit-web/src/routes", key: "web" },
  { prefix: "apps/clients/logit-frontend/src/routes", key: "phone" },
];

/** "apps/clients/logit-web/src/routes/clients/[id]/+page.svelte" -> { app: "web", route: "/clients/[id]" } */
export function routeOfFile(file: string): { app: "web" | "phone"; route: string } | null {
  for (const { prefix, key } of APPS) {
    if (!file.startsWith(prefix + "/")) continue;
    const parts = file.slice(prefix.length + 1).split("/");
    if (!/^\+page(\.server)?\.(svelte|ts)$/.test(parts.at(-1)!)) return null;
    const route = "/" + parts.slice(0, -1).filter((p) => !/^\(.*\)$/.test(p)).join("/");
    return { app: key, route: route === "/" ? "/" : route.replace(/\/$/, "") };
  }
  return null;
}

export type Review = { docsFile: string; feature: string; changed: string[] };

/** Docs pages whose feature's pages changed while the docs page itself didn't. */
export function docsToReview(changedFiles: string[]): Review[] {
  const changed = new Set(changedFiles);
  const byDocs = new Map<string, Review>();
  for (const file of changedFiles) {
    const r = routeOfFile(file);
    if (!r) continue;
    for (const f of FEATURES.filter((x) => x[r.app]?.includes(r.route))) {
      const docsFile = `apps/clients/website/src/routes/(docs)${f.docs.split("#")[0]}/+page.svx`;
      if (changed.has(docsFile)) continue;
      const review = byDocs.get(docsFile) ?? { docsFile, feature: f.title, changed: [] };
      review.changed.push(file);
      byDocs.set(docsFile, review);
    }
  }
  return [...byDocs.values()];
}
