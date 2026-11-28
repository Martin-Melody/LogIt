/**
 * Phase packs (Phase 6.10, canvas SP8/SP9): a starting phase for programs, like "Find your
 * weights", with the parts it needs under one listing and one install: the block that runs each
 * lift in its weeks, a progression for them, and start-up questions. Data only: the parts are
 * other plugins (a workout-block, a progression-algorithm, a question-pack), installed with it.
 */

export const PHASE_PACK_FORMAT_VERSION = 1 as const;

export type PhasePack = {
  formatVersion: 1;
  pluginId: string;
  phase: {
    name: string;
    /** How many weeks it usually runs; the coach can change it. */
    weeks: number;
    /** It works up to the weights that fit; the next phase plans from what it found. */
    findsWeights: boolean;
    /** A workout-block plugin that runs each lift in these weeks. */
    block?: string;
    /** A progression-algorithm plugin for these weeks. */
    progression?: string;
  };
  /** Plugins installed with the pack: the block, progression and question pack above. */
  includes: string[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

export function parsePhasePack(raw: unknown, pluginId: string): PhasePack {
  if (!isObject(raw)) throw new Error("This pack isn't a phase pack.");
  if (raw.formatVersion !== PHASE_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  const p = raw.phase;
  if (!isObject(p) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 40) throw new Error("The phase needs a name (up to 40 characters).");
  const weeks = Number(p.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("A phase runs 1 to 12 weeks.");
  for (const k of ["block", "progression"] as const) {
    if (p[k] !== undefined && (typeof p[k] !== "string" || !ID.test(p[k] as string))) throw new Error(`The phase's ${k} should be a plugin id, like app.example.my-${k}.`);
  }
  const includes = Array.isArray(raw.includes) ? raw.includes : [];
  if (includes.some((x) => typeof x !== "string" || !ID.test(x)) || includes.length > 6) throw new Error("includes should list up to 6 plugin ids.");
  for (const part of [p.block, p.progression]) {
    if (typeof part === "string" && !includes.includes(part)) throw new Error(`${part} is used by the phase, so it has to be in includes too.`);
  }
  return {
    formatVersion: PHASE_PACK_FORMAT_VERSION,
    pluginId,
    phase: {
      name: p.name.trim(),
      weeks,
      findsWeights: p.findsWeights === true,
      ...(typeof p.block === "string" ? { block: p.block } : {}),
      ...(typeof p.progression === "string" ? { progression: p.progression } : {}),
    },
    includes: includes as string[],
  };
}
