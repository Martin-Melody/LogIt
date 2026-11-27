import { upgradeProgram, type CoachProgram } from "../domain/CoachProgram";

/**
 * Program pack: a content plugin (canvas PG1, PG5 "Community"). Pure data: programs a coach can
 * copy into their own. No code, so it installs whatever Restricted Mode says. Copying makes the
 * coach's own program; a newer pack version never changes it.
 */

export const PROGRAM_PACK_FORMAT_VERSION = 1 as const;
/** Caps, so a broken or hostile pack can't make a huge program. */
export const MAX_PACK_PROGRAMS = 20, MAX_PACK_WEEKS = 52, MAX_PACK_DAYS = 7, MAX_PACK_BLOCKS = 40;

export type ProgramPack = {
  formatVersion: typeof PROGRAM_PACK_FORMAT_VERSION;
  pluginId: string;
  programs: CoachProgram[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The pack, checked; throws with words a coach can read when it isn't one. */
export function parseProgramPack(raw: unknown, pluginId: string): ProgramPack {
  if (!isObject(raw)) throw new Error("This pack isn't a program pack.");
  if (raw.formatVersion !== PROGRAM_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  if (!Array.isArray(raw.programs) || raw.programs.length === 0) throw new Error("This pack has no programs.");
  if (raw.programs.length > MAX_PACK_PROGRAMS) throw new Error(`A pack can have up to ${MAX_PACK_PROGRAMS} programs.`);
  const programs = raw.programs.map((p, i): CoachProgram => {
    if (!isObject(p) || typeof p.name !== "string" || !p.name.trim() || !Array.isArray(p.weeks)) throw new Error(`Program ${i + 1} is missing its name or weeks.`);
    if (p.weeks.length === 0 || p.weeks.length > MAX_PACK_WEEKS) throw new Error(`"${p.name}" needs 1 to ${MAX_PACK_WEEKS} weeks.`);
    for (const w of p.weeks) {
      if (!isObject(w) || !Array.isArray(w.days) || w.days.length > MAX_PACK_DAYS) throw new Error(`"${p.name}" has a week with too many days.`);
      for (const d of w.days) if (!isObject(d) || !Array.isArray(d.blocks) || d.blocks.length > MAX_PACK_BLOCKS) throw new Error(`"${p.name}" has a day with too many exercises.`);
    }
    // A pack's ids are only its own: they're replaced when copied.
    return upgradeProgram({ archived: false, startMode: "manual", lengthWeeks: p.weeks.length, createdAtMs: 0, updatedAtMs: 0, ...p, id: `${pluginId}#${i}` } as CoachProgram);
  });
  return { formatVersion: PROGRAM_PACK_FORMAT_VERSION, pluginId, programs };
}
