import { fileURLToPath } from "node:url";
import { createHighlighter } from "shiki";

const layoutPath = fileURLToPath(new URL("./src/lib/docs/DocLayout.svelte", import.meta.url));

const LANGS = ["ts", "js", "json", "jsonc", "svelte", "bash", "sh"];
const THEMES = { light: "github-light", dark: "github-dark" };

let highlighterPromise;
function getHighlighter() {
  highlighterPromise ??= createHighlighter({ themes: Object.values(THEMES), langs: LANGS });
  return highlighterPromise;
}

/** Gives every h2–h4 an id from its text ("Reasoning and nudges" → "reasoning-and-nudges"),
 * so the docs' #anchor links work. Duplicate headings get -2, -3, … like GitHub. */
function headingIds() {
  const text = (node) =>
    node.type === "text" ? node.value : (node.children ?? []).map(text).join("");
  return (tree) => {
    const seen = new Map();
    const walk = (node) => {
      if (node.type === "element" && /^h[2-4]$/.test(node.tagName) && !node.properties?.id) {
        const base = text(node).toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        node.properties = { ...node.properties, id: n === 1 ? base : `${base}-${n}` };
      }
      (node.children ?? []).forEach(walk);
    };
    walk(tree);
  };
}

/** @type {import('mdsvex').MdsvexOptions} */
const config = {
  extensions: [".svx"],
  smartypants: { dashes: "oldschool" },
  highlight: {
    highlighter: async (code, lang = "text") => {
      const hl = await getHighlighter();
      const safe = LANGS.includes(lang) ? lang : "text";
      const html = hl.codeToHtml(code, {
        lang: safe,
        themes: THEMES,
        defaultColor: false,
      });
      // mdsvex feeds the result straight into a Svelte template — escape braces.
      return `{@html ${JSON.stringify(html)}}`;
    },
  },
  rehypePlugins: [headingIds],
  layout: {
    _: layoutPath,
  },
};

export default config;
