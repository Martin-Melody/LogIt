import { Lexer, type Token, type Tokens } from "marked";

/**
 * Formatted text (forum posts now; a coach's agreement and About text next) is stored as
 * Markdown, the same dialect the web editor writes (TipTap's Markdown, which uses marked).
 * Apps don't turn it into HTML: this turns it into a small typed tree that each app draws
 * with its own components, so nothing a person types can become markup, and @mentions and
 * #tags keep each app's own links. Raw HTML, images and tables come out as plain text; links
 * are kept only for http, https and mailto.
 *
 * Plain text written before formatting existed reads the same: single line breaks are kept
 * (GFM "breaks").
 */
export type RtInline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "del"; children: RtInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: RtInline[] }
  | { type: "br" };

export type RtBlock =
  | { type: "p"; inline: RtInline[] }
  | { type: "h"; level: 1 | 2 | 3; inline: RtInline[] }
  | { type: "list"; ordered: boolean; start: number; items: RtBlock[][] }
  | { type: "quote"; blocks: RtBlock[] }
  | { type: "code"; text: string }
  | { type: "hr" };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function richTextBlocks(markdown: string): RtBlock[] {
  if (!markdown.trim()) return [];
  const tokens = new Lexer({ gfm: true, breaks: true }).lex(markdown);
  return blocks(tokens);
}

function blocks(tokens: Token[]): RtBlock[] {
  const out: RtBlock[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "space":
        break;
      case "paragraph":
        out.push({ type: "p", inline: inline((t as Tokens.Paragraph).tokens) });
        break;
      case "text": {
        // A list item's loose text: a paragraph of its own inline tokens.
        const tt = t as Tokens.Text;
        out.push({ type: "p", inline: tt.tokens ? inline(tt.tokens) : [{ type: "text", text: tt.text }] });
        break;
      }
      case "heading": {
        const h = t as Tokens.Heading;
        out.push({ type: "h", level: Math.min(3, Math.max(1, h.depth)) as 1 | 2 | 3, inline: inline(h.tokens) });
        break;
      }
      case "list": {
        const l = t as Tokens.List;
        out.push({
          type: "list",
          ordered: l.ordered,
          start: typeof l.start === "number" ? l.start : 1,
          items: l.items.map((item) => blocks(item.tokens)),
        });
        break;
      }
      case "blockquote":
        out.push({ type: "quote", blocks: blocks((t as Tokens.Blockquote).tokens) });
        break;
      case "code":
        out.push({ type: "code", text: (t as Tokens.Code).text });
        break;
      case "hr":
        out.push({ type: "hr" });
        break;
      default:
        // html, table, def and anything newer: what was typed, as plain text.
        if (t.raw.trim()) out.push({ type: "p", inline: [{ type: "text", text: t.raw.trim() }] });
    }
  }
  return out;
}

function inline(tokens: Token[] | undefined): RtInline[] {
  const out: RtInline[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
      case "em":
      case "del":
        out.push({ type: t.type, children: inline((t as Tokens.Strong).tokens) });
        break;
      case "codespan":
        out.push({ type: "code", text: (t as Tokens.Codespan).text });
        break;
      case "br":
        out.push({ type: "br" });
        break;
      case "link": {
        const l = t as Tokens.Link;
        const children = inline(l.tokens);
        if (SAFE_HREF.test(l.href)) out.push({ type: "link", href: l.href, children });
        else out.push(...children);
        break;
      }
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) out.push(...inline(tt.tokens));
        else out.push({ type: "text", text: tt.text });
        break;
      }
      case "escape":
        out.push({ type: "text", text: (t as Tokens.Escape).text });
        break;
      case "image": {
        // No pictures inside text: the words, and the address if it's a safe one.
        const img = t as Tokens.Image;
        out.push({ type: "text", text: img.text || img.href });
        break;
      }
      default:
        // Raw HTML and anything else: exactly what was typed.
        out.push({ type: "text", text: t.raw });
    }
  }
  return merge(out);
}

/** marked splits text at entities and escapes; joining neighbours keeps @mentions whole. */
function merge(list: RtInline[]): RtInline[] {
  const out: RtInline[] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (x.type === "text" && last?.type === "text") last.text += x.text;
    else out.push(x.type === "text" ? { ...x } : x);
  }
  return out;
}

/** The words without the formatting, for one-line previews and page descriptions. */
export function richTextPlain(markdown: string): string {
  const words: string[] = [];
  const walkInline = (xs: RtInline[]) => {
    for (const x of xs) {
      if (x.type === "text" || x.type === "code") words.push(x.text);
      else if (x.type === "br") words.push(" ");
      else if (x.type !== "link") walkInline(x.children);
      else walkInline(x.children);
    }
  };
  const walk = (bs: RtBlock[]) => {
    for (const b of bs) {
      if (b.type === "p" || b.type === "h") walkInline(b.inline);
      else if (b.type === "list") b.items.forEach(walk);
      else if (b.type === "quote") walk(b.blocks);
      else if (b.type === "code") words.push(b.text);
      words.push(" ");
    }
  };
  walk(richTextBlocks(markdown));
  return words.join("").replace(/\s+/g, " ").trim();
}
