export type DocLink = { title: string; href: string };
export type DocSection = { title: string; links: DocLink[] };

export const docsNav: DocSection[] = [
  {
    title: "Getting started",
    links: [
      { title: "Overview", href: "/docs" },
      { title: "Self-hosting", href: "/self-hosting" },
    ],
  },
  {
    title: "Plugins",
    links: [
      { title: "Introduction", href: "/docs/plugins" },
      { title: "Trust & the sandbox", href: "/docs/plugins/trust" },
      { title: "Exercise packs", href: "/docs/plugins/exercise-packs" },
      { title: "Progression algorithms", href: "/docs/plugins/progression" },
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
