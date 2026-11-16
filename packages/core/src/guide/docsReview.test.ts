import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { docsToReview, routeOfFile } from "./docsReview";

describe("docs to re-read after a change", () => {
  it("maps page files to routes", () => {
    expect(routeOfFile("apps/clients/logit-web/src/routes/clients/[id]/+page.svelte")).toEqual({ app: "web", route: "/clients/[id]" });
    expect(routeOfFile("apps/clients/logit-frontend/src/routes/+page.svelte")).toEqual({ app: "phone", route: "/" });
    expect(routeOfFile("apps/clients/logit-web/src/lib/x.ts")).toBeNull();
  });

  it("names the docs page when a feature's page changed without it", () => {
    const page = "apps/clients/logit-web/src/routes/coaching/checkins/+page.svelte";
    const docs = "apps/clients/website/src/routes/(docs)/docs/coaching/checkins/+page.svx";
    expect(docsToReview([page]).map((r) => r.docsFile)).toEqual([docs]);
    expect(docsToReview([page, docs])).toEqual([]);
  });

  // In CI on a pull request (DOCS_REVIEW_BASE=origin/main): print a warning per docs page to
  // re-read. Never fails.
  it.skipIf(!process.env.DOCS_REVIEW_BASE)("warns about docs pages to re-read in this pull request", () => {
    const root = execSync("git rev-parse --show-toplevel").toString().trim();
    const files = execSync(`git diff --name-only ${process.env.DOCS_REVIEW_BASE}...HEAD`, { cwd: root }).toString().split("\n").filter(Boolean);
    for (const r of docsToReview(files)) {
      process.stdout.write(`::warning file=${r.docsFile},title=Re-read the ${r.feature} docs::${r.changed.join(", ")} changed. Check the page still describes it (nothing may need to change).\n`);
    }
  });
});
