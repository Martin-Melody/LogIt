// Forgiving food search: the same matching rules for every list a person searches (the
// bundled food DB, the online cache, custom foods, recipes, saved meals).
//
// People don't type the database's exact name. "eggs" should find "Egg, whole", "beef mince"
// should find USDA's "Beef, ground, 95% lean", "chiken brest" should still find chicken breast
// and word order shouldn't matter. So a query is split into words, each word is widened
// (plural/singular, UK/US names) and matched loosely (prefix, then a small typo budget), and
// candidates are ranked by how well every word matched.

// ── Text ─────────────────────────────────────────────────────────────────────

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["a", "an", "the", "of", "with", "and", "in", "on", "for", "or", "to"]);

function words(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(" ") : [];
}

/** The words of a query that carry meaning (all of them if every word is a stop word). */
export function queryWords(q: string): string[] {
  const all = words(q);
  const kept = all.filter((w) => !STOP_WORDS.has(w));
  return kept.length ? kept : all;
}

/** Rough English singular: berries→berry, tomatoes→tomato, dishes→dish, eggs→egg. */
export function singular(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (/(ss|x|ch|sh|zz)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

// Words that mean the same food, mostly UK/Irish vs the US names USDA uses. Single words
// only; keep a group out if the words aren't interchangeable in a food name.
const SYNONYM_GROUPS: string[][] = [
  ["mince", "minced", "ground"],
  ["courgette", "zucchini"],
  ["aubergine", "eggplant"],
  ["coriander", "cilantro"],
  ["prawn", "shrimp"],
  ["rocket", "arugula"],
  ["porridge", "oatmeal"],
  ["yoghurt", "yogurt", "yogourt"],
  ["chickpea", "garbanzo"],
  ["beetroot", "beet"],
  ["swede", "rutabaga"],
  ["scallion", "spring"],
  ["cornflour", "cornstarch"],
  ["sultana", "raisin"],
  ["soya", "soy"],
  ["choi", "choy"],
  ["wholemeal", "wholewheat"],
  ["mangetout", "snowpea"],
  ["clementine", "mandarin", "tangerine"],
  ["jam", "preserve"],
];

const SYNONYMS = new Map<string, string[]>();
for (const g of SYNONYM_GROUPS) for (const w of g) SYNONYMS.set(w, g.filter((x) => x !== w));

/** Every spelling a query word may appear as in a food name. The first entry is the word itself. */
export function wordVariants(w: string): string[] {
  const out = new Set<string>([w]);
  const s = singular(w);
  out.add(s);
  // "berry" should prefix-match "berries" too.
  if (s.endsWith("y") && s.length > 3) out.add(`${s.slice(0, -1)}i`);
  for (const syn of SYNONYMS.get(s) ?? SYNONYMS.get(w) ?? []) out.add(syn);
  return [...out];
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** Damerau–Levenshtein distance, giving up (returning max + 1) once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos a word of this length may have. */
function typoBudget(len: number): number {
  return len >= 8 ? 2 : len >= 4 ? 1 : 0;
}

/** 0–1: how well one query word matches one word of a name. */
function wordScore(variants: string[], target: string): number {
  let best = 0;
  for (const v of variants) {
    const synonym = v !== variants[0] && v !== singular(variants[0]) ? 0.95 : 1;
    if (target === v || singular(target) === v) return synonym;
    // A prefix counts for less the more of the word is left over: "egg" is a weak
    // match for "eggplant", "chick" a good one for "chicken".
    if (v.length >= 2 && target.startsWith(v)) {
      best = Math.max(best, (0.55 + 0.3 * (v.length / target.length)) * synonym);
    }
    else if (v.length >= 4 && target.length >= 3 && v.startsWith(target)) best = Math.max(best, 0.6 * synonym);
    const budget = typoBudget(v.length);
    if (budget > 0 && best < 0.6) {
      if (editDistance(v, target, budget) <= budget) best = Math.max(best, 0.65 * synonym);
      // A typo in a half-typed word: "chik" vs "chicken".
      else if (target.length > v.length && editDistance(v, target.slice(0, v.length), 1) <= 1) {
        best = Math.max(best, 0.5 * synonym);
      }
    }
  }
  return best;
}

export type PreparedQuery = { raw: string; words: string[]; variants: string[][]; phrase: string };

/** `fixes` adds likely corrections per word (see closestTerms), matched like synonyms. */
export function prepareQuery(q: string, fixes?: Map<string, string[]>): PreparedQuery {
  const ws = queryWords(q);
  return {
    raw: q,
    words: ws,
    variants: ws.map((w) => [...new Set([...wordVariants(w), ...(fixes?.get(w) ?? [])])]),
    phrase: ws.join(" "),
  };
}

/**
 * 0 (no match) to ~1.3 (every word matched exactly, name starts with the query). A name
 * that misses a word still scores when most words match, below every full match.
 */
export function scoreName(query: PreparedQuery, name: string, brand?: string | null): number {
  if (query.words.length === 0) return 0;
  const nameWords = words(name);
  const brandWords = brand ? words(brand) : [];
  let sum = 0;
  let matched = 0;
  for (const variants of query.variants) {
    let best = 0;
    for (const t of nameWords) best = Math.max(best, wordScore(variants, t));
    for (const t of brandWords) best = Math.max(best, 0.8 * wordScore(variants, t));
    if (best > 0) matched++;
    sum += best;
  }
  const n = query.words.length;
  if (matched === 0) return 0;
  if (matched < n) {
    // Partial: only worth showing when most of the words are there.
    if (matched < Math.ceil(n / 2) || n === 1) return 0;
    return (sum / n) * 0.55;
  }
  let score = sum / n;
  const normName = nameWords.map(singular).join(" ");
  const phrase = query.words.map(singular).join(" ");
  if (normName.startsWith(phrase)) score += 0.2;
  else if (normName.includes(phrase)) score += 0.12;
  else if (nameWords[0] && wordScore(query.variants[0], nameWords[0]) >= 0.85) score += 0.08;
  // Prefer "Banana" to "Banana bread with walnuts and chocolate chips".
  score -= Math.min(Math.max(nameWords.length - n, 0) * 0.015, 0.12);
  return score;
}

/** Same food listed twice (same name and brand) — keep the first. */
export function sameFoodKey(name: string, brand?: string | null): string {
  return `${normalizeText(name)}|${normalizeText(brand ?? "")}`;
}

/** Ranks `items` against a query, best first, dropping the ones that don't match. */
export function rankByQuery<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => { name: string; brand?: string | null },
  limit = 50,
): T[] {
  const pq = prepareQuery(query);
  if (pq.words.length === 0) return [];
  return items
    .map((item, i) => {
      const t = text(item);
      return { item, i, s: scoreName(pq, t.name, t.brand) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}

// ── SQLite FTS5 ──────────────────────────────────────────────────────────────

function ftsGroup(variants: string[]): string {
  const terms = variants.filter((v) => /^[a-z0-9%]+$/.test(v)).map((v) => `"${v.replace(/%/g, "")}"*`);
  const uniq = [...new Set(terms)].filter((t) => t !== '""*');
  return uniq.length === 1 ? uniq[0] : `(${uniq.join(" OR ")})`;
}

/**
 * FTS5 MATCH strings for a query: `all` needs every word (in any spelling), `any` takes any
 * word, for a second pass when `all` finds too little. Null when nothing is searchable.
 */
export function ftsQueries(q: string, replace?: Map<string, string[]>): { all: string; any: string } | null {
  const pq = prepareQuery(q);
  const groups = pq.words
    .map((w, i) => ftsGroup([...pq.variants[i], ...(replace?.get(w) ?? [])]))
    .filter((g) => g && g !== "()");
  if (groups.length === 0) return null;
  return { all: groups.join(" AND "), any: groups.join(" OR ") };
}

/**
 * Likely corrections for a word: vocabulary terms within its typo budget that are much more
 * common than the word itself (`knownDocs`, 0 when the word isn't in the vocabulary), so a
 * misspelling that a few products share ("chiken") still finds "chicken".
 */
export function closestTerms(
  word: string,
  vocab: readonly { term: string; docs: number }[],
  max = 3,
  knownDocs = 0,
): string[] {
  const budget = Math.max(typoBudget(word.length), word.length >= 3 ? 1 : 0);
  if (budget === 0) return [];
  const minDocs = Math.max(knownDocs * 3, 2);
  return vocab
    .filter((v) => v.docs >= minDocs && v.term !== word)
    .map((v) => ({ ...v, d: editDistance(word, v.term, budget) }))
    .filter((v) => v.d <= budget)
    .sort((a, b) => a.d - b.d || b.docs - a.docs)
    .slice(0, max)
    .map((v) => v.term);
}
