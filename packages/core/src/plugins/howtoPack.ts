/**
 * How-to packs (Phase 6.13, canvas HT5): data, a coach's or creator's how-tos for exercises
 * (pictures, a video link, three cues, the most common mistake). No code, so installing one asks
 * nothing. A coach's own how-tos win; a pack's fill the rest before LogIt's.
 */
import { parseVideoLink, type CoachHowTo } from "../domain/howTo";

export const HOWTO_PACK_FORMAT_VERSION = 1 as const;
export const MAX_PACK_HOWTOS = 200;
export type HowToPack = { formatVersion: 1; pluginId: string; howtos: CoachHowTo[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function parseHowToPack(raw: unknown, pluginId: string): HowToPack {
  if (!isObject(raw)) throw new Error("This pack isn't a how-to pack.");
  if (raw.formatVersion !== HOWTO_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  if (!Array.isArray(raw.howtos) || raw.howtos.length === 0) throw new Error("This pack has no how-tos.");
  if (raw.howtos.length > MAX_PACK_HOWTOS) throw new Error(`A pack can have up to ${MAX_PACK_HOWTOS} how-tos.`);
  const howtos = raw.howtos.map((h, i): CoachHowTo => {
    if (!isObject(h) || !str(h.exercise, 120)) throw new Error(`How-to ${i + 1} needs its exercise.`);
    const out: CoachHowTo = { exerciseName: str(h.exercise, 120)! };
    if (h.pictures !== undefined) {
      if (!Array.isArray(h.pictures) || h.pictures.length > 4 || h.pictures.some((p) => typeof p !== "string" || !/^https:\/\//.test(p))) throw new Error(`"${out.exerciseName}": up to four pictures, each an https link.`);
      out.pictures = h.pictures as string[];
    }
    if (h.video !== undefined) {
      const v = typeof h.video === "string" ? parseVideoLink(h.video) : null;
      if (!v) throw new Error(`"${out.exerciseName}": the video has to be a YouTube or Vimeo link.`);
      out.video = v;
    }
    if (h.cues !== undefined) {
      if (!Array.isArray(h.cues) || h.cues.length > 3 || h.cues.some((c) => typeof c !== "string")) throw new Error(`"${out.exerciseName}": up to three cues.`);
      out.cues = (h.cues as string[]).map((c) => c.trim().slice(0, 140)).filter(Boolean);
    }
    const mistake = str(h.mistake, 200);
    if (mistake) out.mistake = mistake;
    return out;
  });
  return { formatVersion: HOWTO_PACK_FORMAT_VERSION, pluginId, howtos };
}
