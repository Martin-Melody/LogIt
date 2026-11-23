import { trimWeight } from "@logit/core/domain/units";

export type DistanceUnit = "km" | "mi";
const METRES: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344 };

/**
 * Typed distance → metres. A plain number is km (miles for lb users); "m" after it, or a plain
 * number over 100, is metres ("400" is a lap, not 400 km). A comma counts as a decimal point.
 */
export function parseDistance(value: string, unit: DistanceUnit = "km"): number | null {
  const match = /^(\d+\.?\d*|\.\d+)\s*(km|mi|m)?$/.exec(value.trim().toLowerCase().replace(",", "."));
  if (!match) return null;
  const n = Number(match[1]);
  if (!(n > 0)) return null;
  const suffix = match[2] as DistanceUnit | "m" | undefined;
  if (suffix === "m" || (!suffix && n > 100)) return Math.round(n);
  return Math.round(n * METRES[suffix ?? unit]);
}

export function distanceInputValue(m: number | null, unit: DistanceUnit = "km"): string {
  if (!m) return "";
  return m < 1000 ? `${m} m` : trimWeight(Number((m / METRES[unit]).toFixed(2)));
}

export function formatDistance(m: number | null, unit: DistanceUnit = "km"): string {
  if (!m) return "—";
  return m < 1000 ? `${m} m` : `${trimWeight(Number((m / METRES[unit]).toFixed(2)))} ${unit}`;
}

/**
 * Typed duration → ms. Android's number keypad has no ":", so a plain number is minutes, and three
 * to six digits read like a clock: "130" is 1:30, "2000" is 20:00, "13000" is 1:30:00. "m:ss" and
 * "h:mm:ss" still work where ":" can be typed.
 */
export function parseDuration(value: string): number | null {
  const t = value.trim().replace(",", ".");
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    const secs = parts.reduce((total, p) => total * 60 + p, 0);
    return secs > 0 ? Math.round(secs * 1000) : null;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/^\d{3,6}$/.test(t)) {
    const clock = t.padStart(6, "0");
    const [h, m, s] = [clock.slice(0, 2), clock.slice(2, 4), clock.slice(4)].map(Number);
    if (m! < 60 && s! < 60) return ((h! * 60 + m!) * 60 + s!) * 1000;
  }
  return Math.round(n * 60_000);
}
