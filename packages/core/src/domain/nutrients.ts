// Nutrients beyond calories and macros: the four that every UK/EU label lists (fibre, sugar,
// saturated fat, salt) and 16 vitamins and minerals. All optional: plain foods from USDA and
// CIQUAL carry most of them, packaged products usually only the label four, and anything
// logged before nutrients existed carries none. Amounts are per 100 g on a food and absolute
// on a logged item or recipe ingredient.

export type NutrientGroup = "label" | "vitamin" | "mineral";

export type NutrientDef = {
  id: string;
  name: string;
  unit: "g" | "mg" | "µg";
  group: NutrientGroup;
  /** The UK/EU adult reference amount for a day; null where there's no sensible one. */
  daily: number | null;
  /** "min": aim to reach it (fibre, vitamins). "max": stay under it (sat fat, salt). */
  kind: "min" | "max";
};

export const NUTRIENTS = [
  { id: "fibreG", name: "Fibre", unit: "g", group: "label", daily: 30, kind: "min" },
  // No target: labels don't separate added ("free") sugar from fruit and milk sugar.
  { id: "sugarG", name: "Sugar", unit: "g", group: "label", daily: null, kind: "max" },
  { id: "satFatG", name: "Saturated fat", unit: "g", group: "label", daily: 30, kind: "max" },
  { id: "saltG", name: "Salt", unit: "g", group: "label", daily: 6, kind: "max" },
  { id: "vitAUg", name: "Vitamin A", unit: "µg", group: "vitamin", daily: 800, kind: "min" },
  { id: "thiaminMg", name: "Thiamin (B1)", unit: "mg", group: "vitamin", daily: 1.1, kind: "min" },
  { id: "riboflavinMg", name: "Riboflavin (B2)", unit: "mg", group: "vitamin", daily: 1.4, kind: "min" },
  { id: "niacinMg", name: "Niacin (B3)", unit: "mg", group: "vitamin", daily: 16, kind: "min" },
  { id: "vitB6Mg", name: "Vitamin B6", unit: "mg", group: "vitamin", daily: 1.4, kind: "min" },
  { id: "folateUg", name: "Folate (B9)", unit: "µg", group: "vitamin", daily: 200, kind: "min" },
  { id: "vitB12Ug", name: "Vitamin B12", unit: "µg", group: "vitamin", daily: 2.5, kind: "min" },
  { id: "vitCMg", name: "Vitamin C", unit: "mg", group: "vitamin", daily: 80, kind: "min" },
  // The UK's 10 µg rather than the EU label's 5 µg.
  { id: "vitDUg", name: "Vitamin D", unit: "µg", group: "vitamin", daily: 10, kind: "min" },
  { id: "vitEMg", name: "Vitamin E", unit: "mg", group: "vitamin", daily: 12, kind: "min" },
  { id: "vitKUg", name: "Vitamin K", unit: "µg", group: "vitamin", daily: 75, kind: "min" },
  { id: "calciumMg", name: "Calcium", unit: "mg", group: "mineral", daily: 800, kind: "min" },
  { id: "ironMg", name: "Iron", unit: "mg", group: "mineral", daily: 14, kind: "min" },
  { id: "magnesiumMg", name: "Magnesium", unit: "mg", group: "mineral", daily: 375, kind: "min" },
  { id: "potassiumMg", name: "Potassium", unit: "mg", group: "mineral", daily: 2000, kind: "min" },
  { id: "zincMg", name: "Zinc", unit: "mg", group: "mineral", daily: 10, kind: "min" },
] as const satisfies readonly NutrientDef[];

export type NutrientId = (typeof NUTRIENTS)[number]["id"];

/** Amounts by nutrient; a missing key means "not known", which is different from 0. */
export type Nutrients = Partial<Record<NutrientId, number>>;

export const NUTRIENT_IDS: readonly NutrientId[] = NUTRIENTS.map((n) => n.id);
export const LABEL_NUTRIENT_IDS: readonly NutrientId[] = NUTRIENTS.filter((n) => n.group === "label").map((n) => n.id);
export const MICRO_NUTRIENT_IDS: readonly NutrientId[] = NUTRIENTS.filter((n) => n.group !== "label").map((n) => n.id);

const BY_ID = new Map<string, NutrientDef>(NUTRIENTS.map((n) => [n.id, n]));

export function nutrientDef(id: NutrientId): NutrientDef {
  return BY_ID.get(id)!;
}

export function isNutrientId(id: string): id is NutrientId {
  return BY_ID.has(id);
}

/** Keeps only known ids with finite, non-negative values; undefined when nothing is left. */
export function cleanNutrients(n: unknown): Nutrients | undefined {
  if (!n || typeof n !== "object") return undefined;
  const out: Nutrients = {};
  let any = false;
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    const x = typeof v === "number" ? v : Number.NaN;
    if (isNutrientId(k) && Number.isFinite(x) && x >= 0) {
      out[k] = x;
      any = true;
    }
  }
  return any ? out : undefined;
}

export function scaleNutrients(per100g: Nutrients | undefined, grams: number): Nutrients | undefined {
  if (!per100g) return undefined;
  const f = grams / 100;
  const out: Nutrients = {};
  for (const id of NUTRIENT_IDS) {
    const v = per100g[id];
    if (v !== undefined) out[id] = v * f;
  }
  return out;
}

/** Sum of two sets; a nutrient is known in the result when either side knows it. */
export function addNutrients(a: Nutrients | undefined, b: Nutrients | undefined): Nutrients | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const out: Nutrients = { ...a };
  for (const id of NUTRIENT_IDS) {
    const v = b[id];
    if (v !== undefined) out[id] = (out[id] ?? 0) + v;
  }
  return out;
}

/** 3 significant figures, which is more than any source is accurate to. */
export function roundNutrients(n: Nutrients | undefined): Nutrients | undefined {
  if (!n) return undefined;
  const out: Nutrients = {};
  for (const id of NUTRIENT_IDS) {
    const v = n[id];
    if (v !== undefined) out[id] = v === 0 ? 0 : Number(v.toPrecision(3));
  }
  return out;
}

/** Whether a food or item knows any vitamin or mineral (not just the label four). */
export function hasMicros(n: Nutrients | undefined): boolean {
  return !!n && MICRO_NUTRIENT_IDS.some((id) => n[id] !== undefined);
}

export function hasLabelNutrients(n: Nutrients | undefined): boolean {
  return !!n && LABEL_NUTRIENT_IDS.some((id) => n[id] !== undefined);
}

/** "8.2 g", "0.25 g" salt, "0.37 mg", "26 µg", "2,450 mg". */
export function formatNutrient(id: NutrientId, value: number): string {
  const unit = nutrientDef(id).unit;
  // Grams as a label prints them: one decimal, two for small amounts of salt.
  const digits =
    unit === "g"
      ? value >= 10 ? 0 : id === "saltG" && value < 1 ? 2 : 1
      : value >= 100 ? 0 : value >= 10 ? 1 : value >= 1 ? 1 : 2;
  const text = value.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return `${text} ${unit}`;
}

/** Share of the daily amount, as a whole percent; null when the nutrient has none. */
export function percentOfDaily(id: NutrientId, value: number): number | null {
  const daily = nutrientDef(id).daily;
  return daily ? Math.round((value / daily) * 100) : null;
}

// ── A day ─────────────────────────────────────────────────────────────────────

type ItemLike = { name: string; grams: number; computed: { kcal: number }; nutrients?: Nutrients };

export type NutrientSource = { name: string; amount: number };

export type DayNutrients = {
  totals: Nutrients;
  /** Biggest contributors per nutrient, largest first. */
  sources: Partial<Record<NutrientId, NutrientSource[]>>;
  /** How much of the day the vitamin and mineral figures cover. */
  coverage: { items: number; withMicros: number; kcal: number; kcalWithMicros: number };
  /** Foods eaten that have no vitamin or mineral data (each name once). */
  missingMicros: string[];
};

export function dayNutrients(items: readonly ItemLike[]): DayNutrients {
  const totals: Nutrients = {};
  const sources: Partial<Record<NutrientId, Map<string, number>>> = {};
  let withMicros = 0;
  let kcal = 0;
  let kcalWithMicros = 0;
  const missing = new Set<string>();
  for (const it of items) {
    kcal += it.computed.kcal;
    const n = it.nutrients;
    if (hasMicros(n)) {
      withMicros++;
      kcalWithMicros += it.computed.kcal;
    } else {
      missing.add(it.name);
    }
    if (!n) continue;
    for (const id of NUTRIENT_IDS) {
      const v = n[id];
      if (v === undefined) continue;
      totals[id] = (totals[id] ?? 0) + v;
      const m = (sources[id] ??= new Map());
      m.set(it.name, (m.get(it.name) ?? 0) + v);
    }
  }
  const sorted: DayNutrients["sources"] = {};
  for (const id of NUTRIENT_IDS) {
    const m = sources[id];
    if (!m) continue;
    sorted[id] = [...m.entries()]
      .filter(([, v]) => v > 0)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }
  return {
    totals,
    sources: sorted,
    coverage: { items: items.length, withMicros, kcal, kcalWithMicros },
    missingMicros: [...missing],
  };
}
