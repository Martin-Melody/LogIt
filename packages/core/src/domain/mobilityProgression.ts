import type { AlgorithmPreferencesField } from "./progression";
import type { MobilityMetric, MobilitySide } from "./workout";

/**
 * A mobility progression algorithm turns a drill's recent history into the next
 * session's targets — the stretching analog of `ProgressionAlgorithm`. Same
 * contract shape (pure `suggest(input) => output`, opaque threaded state,
 * optional `preferencesSchema`) so it runs through the exact same interpreter
 * sandbox and settings plumbing. See docs/plugin-bundle-format.md.
 *
 * The key difference from strength progression: a drill is measured by hold
 * time OR by reps (± load), and unilateral drills progress each side
 * independently — so `sets` and `history` carry an optional `side`.
 */

export { type AlgorithmPreferencesField };

export type MobilityProgressionAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type MobilitySetRecord = {
  side?: MobilitySide;
  durationSec?: number;
  reps?: number;
  loadKg?: number;
  targetSec?: number | null;
  depth?: number | null;
  completed?: boolean;
};

export type MobilityHistoryEntry = {
  sessionId: string;
  performedAtMs: number;
  sets: MobilitySetRecord[];
};

export type MobilityProgressionInput = {
  drill: {
    id?: string;
    name: string;
    metric: MobilityMetric;
    perSide: boolean;
    /** Free-text target area, when the drill came from the catalog. */
    area?: string;
  };
  /** Most recent session first. */
  history: MobilityHistoryEntry[];
  /** Algorithm-owned, opaque — the app persists it and threads it back. */
  state: unknown;
  /** Shape defined by the algorithm's `preferencesSchema`. */
  userPreferences: unknown;
  plannedTargets?: { sets?: number; durationSec?: number; reps?: number; loadKg?: number };
  /** Epoch ms "now", passed in to keep the algorithm pure. */
  now: number;
};

export type SuggestedMobilitySet = {
  side?: MobilitySide;
  durationSec?: number;
  reps?: number;
  loadKg?: number;
  note?: string;
};

export type MobilityProgressionOutput = {
  sets: SuggestedMobilitySet[];
  nextState: unknown;
  /** Short summary for the block header, e.g. "Last: 45s L · 40s R → try 50s". */
  label?: string;
  /** Freeform coaching note. */
  notes?: string;
};

export type MobilityProgressionAlgorithm = MobilityProgressionAlgorithmMeta & {
  defaultState: unknown;
  defaultPreferences?: unknown;
  preferencesSchema?: AlgorithmPreferencesField[];
  // Built-ins are synchronous; community algorithms run in the sandbox and
  // resolve asynchronously. Callers must await.
  suggest(
    input: MobilityProgressionInput,
  ): MobilityProgressionOutput | Promise<MobilityProgressionOutput>;
};

export type UserMobilityProgressionConfig = {
  algorithmId: string;
};

export interface MobilityProgressionAlgorithmRegistry {
  list(): Promise<MobilityProgressionAlgorithmMeta[]>;
  get(id: string): Promise<MobilityProgressionAlgorithm | null>;
}
