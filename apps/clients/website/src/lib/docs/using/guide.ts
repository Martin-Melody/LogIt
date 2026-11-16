// The user docs ("Using LogIt") read the app's own feature list, so plan badges, where to
// find things, how-to steps, can/can't lists and the plan table are the same words the app
// uses, and packages/core/src/guide/consistency.test.ts keeps them in step with the app.
import { FEATURES, featureById } from "@logit/core/guide/features";
import { CHAPTERS } from "@logit/core/guide/walkthroughs";
import type { Chapter, DocsSection, Feature, Step } from "@logit/core/guide/types";

export const APP_URL: string = import.meta.env.VITE_APP_URL || "https://app.getlogit.app";

export { FEATURES, featureById };

export function feature(id: string): Feature {
  const f = featureById(id);
  if (!f) throw new Error(`No feature "${id}" in packages/core/src/guide/features.ts`);
  return f;
}

export function chapter(id: string): Chapter {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`No chapter "${id}" in packages/core/src/guide/walkthroughs.ts`);
  return c;
}

/** The steps a docs how-to lists: the web ones, minus "here's the sidebar" ones. */
export const docsSteps = (c: Chapter, on: "web" | "phone" = "web"): Step[] => c.steps.filter((s) => s.on === on && !s.notInDocs);

/** Which app a chapter runs in: the web walkthroughs, or the phone's short tours. */
export const chapterApp = (c: Chapter): "web" | "phone" => (c.steps.some((s) => s.on === "web") ? "web" : "phone");

/** The walkthrough chapter that shows a feature, for "Show me in the app". */
export const chapterFor = (featureId: string): Chapter | undefined => CHAPTERS.find((c) => c.feature === featureId);

export const showMeUrl = (c: Chapter) => `${APP_URL}/?guide=${encodeURIComponent(c.id)}`;

export const SECTION_ORDER: DocsSection[] = ["Start here", "Training", "Body", "More", "Pro", "Having a coach", "Coaching"];

/** One docs page per path; a feature whose docs link has a #section lives on another feature's page. */
export function usingPages(): { section: DocsSection; title: string; href: string; plan: Feature["plan"] }[] {
  const seen = new Set<string>();
  const pages = [];
  for (const section of SECTION_ORDER) {
    for (const f of FEATURES.filter((x) => x.section === section)) {
      if (f.docs.includes("#") || seen.has(f.docs)) continue;
      seen.add(f.docs);
      pages.push({ section, title: f.title, href: f.docs, plan: f.plan });
    }
  }
  return pages;
}
