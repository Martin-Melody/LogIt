// How a plugin block's values read (history, finished entries, the plain view), in the
// person's units. Weights are stored in kg and distances in metres, like the built-in blocks.
import type { BlockFieldType, BlockValue } from "@logit/core/domain/blockPlugin";
import type { WeightUnit } from "@logit/core/domain/units";
import { toDisplayWeight } from "@logit/core/domain/units";

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "5:30" or "330" → seconds; null if it isn't one. */
export function parseMmss(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatBlockValue(type: BlockFieldType, v: BlockValue | undefined, unit: WeightUnit, numberUnit?: string): string {
  if (v == null || v === "") return "–";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "–";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v !== "number") return String(v);
  switch (type) {
    case "duration": return mmss(v);
    case "weight": return `${Math.round(toDisplayWeight(v, unit) * 10) / 10} ${unit === "lbs" ? "lb" : "kg"}`;
    case "distance": return unit === "lbs" ? `${Math.round((v / 1609.344) * 100) / 100} mi` : v >= 1000 ? `${Math.round(v / 10) / 100} km` : `${Math.round(v)} m`;
    default: return numberUnit ? `${v} ${numberUnit}` : String(v);
  }
}
