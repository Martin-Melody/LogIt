// Keeps the walkthroughs and the docs honest. This test reads the other apps' source, so it
// fails a pull request when the feature list (features.ts, walkthroughs.ts) and the apps or
// the server disagree. Each failure message says what to change.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURES, NO_DOCS, featureById } from "./features";
import { CHAPTERS } from "./walkthroughs";
import { PLANS } from "./types";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APPS = {
  web: join(ROOT, "apps/clients/logit-web/src"),
  phone: join(ROOT, "apps/clients/logit-frontend/src"),
};
const DOCS_ROUTES = join(ROOT, "apps/clients/website/src/routes");
const GATES = join(ROOT, "docs/generated/tier-gates.json");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** SvelteKit route ids: "src/routes/clients/[id]/+page.svelte" -> "/clients/[id]". Groups "(x)" drop out. */
function routeIds(routesDir: string, file: RegExp): string[] {
  return walk(routesDir)
    .filter((p) => file.test(p))
    .map((p) => "/" + relative(routesDir, p).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).join("/"))
    .map((r) => (r === "/" ? r : r.replace(/\/$/, "")));
}

const sourceFiles = (app: keyof typeof APPS) =>
  walk(APPS[app]).filter((p) => /\.(svelte|ts)$/.test(p) && !/\.test\.ts$/.test(p));

function matchesIn(app: keyof typeof APPS, re: RegExp): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(app)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const list = found.get(m[1]) ?? [];
      list.push(relative(ROOT, file));
      found.set(m[1], list);
    }
  }
  return found;
}

const steps = CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c.id })));

describe("feature list", () => {
  it("has unique ids, and every chapter and plan row points at a real feature", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHAPTERS) expect(featureById(c.feature), `chapter ${c.id} -> feature ${c.feature}`).toBeTruthy();
    const chapterIds = CHAPTERS.map((c) => c.id);
    expect(new Set(chapterIds).size).toBe(chapterIds.length);
    for (const f of FEATURES) expect(PLANS).toContain(f.plan);
  });

  for (const app of ["web", "phone"] as const) {
    it(`covers every ${app} page (add it to a feature in features.ts, or to NO_DOCS)`, () => {
      const routes = routeIds(join(APPS[app], "routes"), /\+page\.svelte$/);
      const claimed = new Set([...FEATURES.flatMap((f) => f[app] ?? []), ...NO_DOCS[app]]);
      expect(routes.filter((r) => !claimed.has(r)), `${app} pages with no feature`).toEqual([]);
      expect([...claimed].filter((r) => !routes.includes(r)), `features.ts lists ${app} pages that don't exist`).toEqual([]);
    });
  }

  it("has a docs page for every feature (apps/clients/website/src/routes/(docs)/docs/...)", () => {
    const pages = routeIds(DOCS_ROUTES, /\+page\.svx$/);
    const missing = [...new Set(FEATURES.map((f) => f.docs.split("#")[0]))].filter((d) => !pages.includes(d));
    expect(missing, "docs pages to write").toEqual([]);
  });
});

describe("docs pages", () => {
  const pageSource = (docs: string) => {
    const path = join(DOCS_ROUTES, "(docs)", docs.split("#")[0], "+page.svx");
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };

  it("show each feature's facts or can/can't list on its own page", () => {
    const missing = FEATURES.filter((f) => {
      const src = pageSource(f.docs);
      return src && !new RegExp(`(id="${f.id}"|"${f.id}"[\\],])`).test(src);
    }).map((f) => `${f.docs}: add <FeatureFacts id="${f.id}" /> or <CanCant ids={["${f.id}"]} />`);
    expect(missing).toEqual([]);
  });

  it("publish every walkthrough chapter and phone tour as a how-to on its feature's page", () => {
    const missing = CHAPTERS.filter((c) => c.steps.some((s) => !s.notInDocs))
      .filter((c) => !pageSource(featureById(c.feature)!.docs).includes(`<HowTo id="${c.id}"`))
      .map((c) => `${featureById(c.feature)!.docs}: add <HowTo id="${c.id}" />`);
    expect(missing).toEqual([]);
  });
});

describe("words the docs and walkthroughs use", () => {
  const docsFiles = walk(join(DOCS_ROUTES, "(docs)", "docs")).filter((f) => f.endsWith(".svx") && !f.includes(`${sep}plugins${sep}`))
    .concat(join(DOCS_ROUTES, "(docs)", "docs", "+page.svx"));
  const docsPages = new Set(routeIds(DOCS_ROUTES, /\+page\.(svx|svelte)$/));
  const slug = (t: string) => t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");

  it("link only to docs pages and sections that exist", () => {
    const broken: string[] = [];
    for (const file of [...new Set(docsFiles)]) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)) {
        const [path, hash] = (m[1] ?? m[2]).split("#");
        if (path.startsWith("/docs/shots")) continue;
        if (!docsPages.has(path.replace(/\/$/, "") || "/")) { broken.push(`${relative(ROOT, file)}: ${m[1] ?? m[2]}`); continue; }
        if (hash) {
          const target = join(DOCS_ROUTES, "(docs)", path, "+page.svx");
          const headings = existsSync(target) ? [...readFileSync(target, "utf8").matchAll(/^#{2,4} (.+)$/gm)].map((h) => slug(h[1])) : [];
          if (!headings.includes(hash)) broken.push(`${relative(ROOT, file)}: ${m[1] ?? m[2]} (no such section)`);
        }
      }
    }
    for (const f of FEATURES) {
      const [path, hash] = f.docs.split("#");
      if (!hash) continue;
      const src = readFileSync(join(DOCS_ROUTES, "(docs)", path, "+page.svx"), "utf8");
      if (![...src.matchAll(/^#{2,4} (.+)$/gm)].some((h) => slug(h[1]) === hash)) broken.push(`features.ts ${f.id}: ${f.docs} (no such section)`);
    }
    expect(broken).toEqual([]);
  });

  // "Open Coaching › Check-ins" names menu items. Each item must still be a label somewhere in the
  // web or phone app, or the docs send people to something that's been renamed or moved.
  it("name menu items (A › B) that the apps still show", () => {
    const appText = [...sourceFiles("web"), ...sourceFiles("phone")].map((f) => readFileSync(f, "utf8")).join("\n")
      .replace(/&amp;/g, "&");
    const shown = (label: string) => {
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(["'>\`]|^\\s*)${esc}(\\s*["'<\`]|\\s*$| ·)`, "m").test(appText);
    };
    const texts: { where: string; text: string }[] = [
      ...[...new Set(docsFiles)].map((f) => ({ where: relative(ROOT, f), text: readFileSync(f, "utf8") })),
      ...CHAPTERS.flatMap((c) => c.steps.map((st) => ({ where: `walkthroughs ${c.id}/${st.id}`, text: `${st.body} ${st.empty ?? ""} ${st.arrives ?? ""}` }))),
      ...FEATURES.map((f) => ({ where: `features ${f.id}`, text: `${f.whereWeb ?? ""}\n${f.wherePhone ?? ""}` })),
    ];
    const missing = new Set<string>();
    for (const { where, text } of texts) {
      for (const m of text.matchAll(/([^\n.:;(]*?)((?: › [^\n.:;›(]+)+)/g)) {
        // A comma ends a label: "Home › Quick Start, and Sessions".
        const parts = [m[1], ...m[2].split(" › ").slice(1).map((p) => p.split(",")[0])].map((p) => p.trim().split(/\s+/));
        parts.forEach((words, i) => {
          // Before the first ›: the last words ("Open Coaching" -> "Coaching"); after: the first words.
          const candidates = words.map((_, n) => (i === 0 ? words.slice(words.length - 1 - n) : words.slice(0, n + 1)).join(" "));
          if (!words[0] || !/^[A-Z+]/.test(i === 0 ? words.at(-1)! : words[0])) return; // "a client": a placeholder
          if (!candidates.some(shown)) missing.add(`${where}: "${i === 0 ? words.at(-1) : words[0]}…" in "${(m[1] + m[2]).trim()}"`);
        });
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("plan locks on the server (docs/generated/tier-gates.json)", () => {
  type Gate = { method: string; route: string; plan: string; orActivelyCoached: boolean };
  const gates = JSON.parse(readFileSync(GATES, "utf8")) as Gate[];
  const norm = (r: string) => r.replace(/:[a-z]+(?=})/gi, "").replace(/\/$/, "");

  it("belong to exactly one feature, with the plan the docs say", () => {
    const problems: string[] = [];
    for (const g of gates) {
      const owners = FEATURES.filter((f) => f.server?.some((r) => norm(r) === norm(g.route)));
      if (owners.length !== 1) {
        problems.push(`${g.method} ${g.route}: owned by ${owners.length} features (add it to one feature's "server" list)`);
        continue;
      }
      const f = owners[0];
      if (f.plan !== g.plan) problems.push(`${g.method} ${g.route}: server locks it to ${g.plan}, features.ts says ${f.id} is ${f.plan}`);
      if (!!f.freeWhenCoached !== g.orActivelyCoached)
        problems.push(`${g.method} ${g.route}: server ${g.orActivelyCoached ? "lets" : "doesn't let"} coached Free clients in; ${f.id}.freeWhenCoached disagrees`);
    }
    expect(problems).toEqual([]);
  });

  it("and features don't claim locks the server no longer has", () => {
    const real = new Set(gates.map((g) => norm(g.route)));
    const stale = FEATURES.flatMap((f) => (f.server ?? []).filter((r) => !real.has(norm(r))).map((r) => `${f.id}: ${r}`));
    expect(stale).toEqual([]);
  });
});

describe("walkthrough steps", () => {
  // A mark is data-guide="x" on an element, or a guideMark: "x" / someGuideMark="x" declaration
  // for one that's rendered from data (the phone's bottom bar items, a component's prop).
  const MARK = /(?:data-guide|[gG]uideMark)[=:]\s*"([^"]+)"/g;
  const anchors = { web: matchesIn("web", MARK), phone: matchesIn("phone", MARK) };
  const signals = {
    web: matchesIn("web", /guideSignal\(\s*["']([^"']+)["']/g),
    phone: matchesIn("phone", /guideSignal\(\s*["']([^"']+)["']/g),
  };

  it("point at marks that exist in the app they run in", () => {
    const missing = steps.filter((s) => s.target && !anchors[s.on].has(s.target)).map((s) => `${s.chapter}/${s.id}: data-guide="${s.target}" (${s.on})`);
    expect(missing).toEqual([]);
  });

  it("and every mark in the apps is used by a step", () => {
    for (const app of ["web", "phone"] as const) {
      const used = new Set(steps.filter((s) => s.on === app).map((s) => s.target));
      const unused = [...anchors[app].entries()].filter(([a]) => !used.has(a)).map(([a, files]) => `${a} in ${files[0]}`);
      expect(unused, `${app}: data-guide marks no step uses`).toEqual([]);
    }
  });

  it("never use a computed mark (it couldn't be checked)", () => {
    for (const app of ["web", "phone"] as const) {
      const computed = sourceFiles(app).filter((f) => /data-guide=\{(?![^}]*[gG]uideMark)/.test(readFileSync(f, "utf8")));
      expect(computed.map((f) => relative(ROOT, f))).toEqual([]);
    }
  });

  it("wait for signals the app really sends, and every signal is waited for", () => {
    const missing = steps.filter((s) => s.kind === "do" && (!s.signal || !signals[s.on].has(s.signal)))
      .map((s) => `${s.chapter}/${s.id}: guideSignal("${s.signal}") (${s.on})`);
    expect(missing).toEqual([]);
    for (const app of ["web", "phone"] as const) {
      const used = new Set(steps.filter((s) => s.on === app).map((s) => s.signal));
      expect([...signals[app].keys()].filter((k) => !used.has(k)), `${app}: signals no step waits for`).toEqual([]);
    }
  });

  it("are on pages that exist, and belong to their chapter's feature or a page it links to", () => {
    for (const s of steps) {
      const routes = routeIds(join(APPS[s.on], "routes"), /\+page\.svelte$/);
      expect(routes, `${s.chapter}/${s.id} route`).toContain(s.route);
    }
  });

  it("all have something to say", () => {
    for (const c of CHAPTERS) {
      expect(c.steps.length, c.id).toBeGreaterThan(0);
      for (const s of c.steps) {
        expect(s.title.trim(), `${c.id}/${s.id}`).not.toBe("");
        expect(s.body.trim(), `${c.id}/${s.id}`).not.toBe("");
      }
    }
  });
});

describe("generated files", () => {
  it("tier-gates.json exists (made by the API's TierGateSnapshotTests)", () => {
    expect(existsSync(GATES)).toBe(true);
  });
});
