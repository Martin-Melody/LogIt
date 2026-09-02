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
  layout: {
    _: layoutPath,
  },
};

export default config;
