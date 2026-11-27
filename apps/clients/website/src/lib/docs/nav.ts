import { SECTION_ORDER, usingPages } from "./using/guide";
export type DocLink = { title: string; href: string };
export type DocSection = { title: string; links: DocLink[] };

// "Using LogIt" pages come from the app's feature list (one page per feature's docs link), so
// a feature added to packages/core/src/guide/features.ts shows up here and must get a page.
const SECTION_TITLES: Record<string, string> = { Pro: "Pro", Coaching: "Coaching (Studio)" };

const usingSections: DocSection[] = SECTION_ORDER.map((section) => ({
  title: SECTION_TITLES[section] ?? section,
  links: [
    ...(section === "Start here"
      ? [{ title: "Using LogIt", href: "/docs" }, { title: "What each plan can do", href: "/docs/plans" }]
      : []),
    ...usingPages().filter((p) => p.section === section).map((p) => ({ title: p.title, href: p.href })),
  ],
}));

export const docsNav: DocSection[] = [
  ...usingSections,
  {
    title: "Developers",
    links: [
      { title: "Self-hosting", href: "/self-hosting" },
      { title: "Building plugins", href: "/docs/plugins" },
      { title: "Trust & the sandbox", href: "/docs/plugins/trust" },
      { title: "Exercise packs", href: "/docs/plugins/exercise-packs" },
      { title: "Mobility packs", href: "/docs/plugins/mobility-packs" },
      { title: "Program packs", href: "/docs/plugins/program-packs" },
      { title: "Workout blocks", href: "/docs/plugins/workout-blocks" },
      { title: "Progression algorithms", href: "/docs/plugins/progression" },
      { title: "Mobility progression", href: "/docs/plugins/mobility-progression" },
      { title: "Analytics", href: "/docs/plugins/analytics" },
      { title: "Nutrition algorithms", href: "/docs/plugins/nutrition" },
      { title: "Widgets", href: "/docs/plugins/widgets" },
      { title: "Widget primitives", href: "/docs/plugins/primitives" },
      { title: "Publishing", href: "/docs/plugins/publishing" },
      { title: "API reference", href: "/docs/plugins/reference" },
    ],
  },
];

export const flatDocs: DocLink[] = docsNav.flatMap((s) => s.links);
