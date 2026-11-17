import type { ExerciseHistoryEntry, PrecedingExercise } from "../domain/progression";
import type { MuscleGroup } from "../domain/exercise";

// Within-session fatigue, shared by the built-in strength algorithms: how much the
// exercises before this one have already worked its muscles, and how much this lifter's
// reps actually drop when an exercise comes later in a session.

/** Biggest weight cut from fatigue at the default sensitivity: 15%. */
export const MAX_FATIGUE_DISCOUNT = 0.15;
const REFERENCE_SETS = 3;
/** Sessions needed in each group (done first / done later) before calibrating. */
export const MIN_CALIBRATION_SAMPLES = 3;

/**
 * A fatigue score in [0, 1] from how much the preceding exercises loaded the muscles this
 * one mainly uses. Primary-on-primary overlap counts fully; secondary-on-primary counts at
 * 40%, since those muscles were only assisting. Each preceding exercise is scaled by its
 * effortFactor when known (intensity-weighted sets), otherwise by sets done against a
 * reference block of 3.
 */
export function computeFatigueScore(targetPrimary: MuscleGroup[], preceding: PrecedingExercise[]): number {
  if (targetPrimary.length === 0 || preceding.length === 0) return 0;

  let total = 0;
  for (const prev of preceding) {
    const primaryHitByPrimary = prev.primaryMuscles.filter((m) => targetPrimary.includes(m)).length / targetPrimary.length;
    const primaryHitBySecondary =
      prev.secondaryMuscles.filter((m) => targetPrimary.includes(m)).length / targetPrimary.length;
    const overlapScore = primaryHitByPrimary + primaryHitBySecondary * 0.4;
    const intensityFactor = prev.effortFactor ?? Math.min(prev.completedSets, REFERENCE_SETS * 2) / REFERENCE_SETS;
    total += overlapScore * intensityFactor;
  }
  return Math.min(total, 1);
}

/** Average reps across a session's working sets, as a fraction of the rep ceiling. */
export function performanceScore(entry: ExerciseHistoryEntry, repCeiling: number): number {
  const working = entry.sets.filter((s) => s.setType === "normal" || !s.setType);
  if (working.length === 0) return 0;
  const avgReps = working.reduce((sum, s) => sum + s.reps, 0) / working.length;
  return avgReps / repCeiling;
}

export type FatigueCalibration = {
  sensitivity: number;
  freshSamples: number;
  fatiguedSamples: number;
  calibrated: boolean;
};

/**
 * A personal fatigue sensitivity from history: performance when the exercise was done
 * first vs later in a session. 1.0 (the default discount) and `calibrated: false` until
 * both groups have MIN_CALIBRATION_SAMPLES sessions. Someone whose reps don't drop when
 * tired gets a smaller multiplier; someone who drops more than 10% gets a bigger one.
 * Clamped to [0.1, 2.0].
 */
export function calibrateSensitivity(history: ExerciseHistoryEntry[], repCeiling: number): FatigueCalibration {
  const fresh = history.filter((h) => (h.sessionPosition ?? 0) === 0);
  const fatigued = history.filter((h) => (h.sessionPosition ?? 0) > 0);
  const freshSamples = fresh.length;
  const fatiguedSamples = fatigued.length;

  if (freshSamples < MIN_CALIBRATION_SAMPLES || fatiguedSamples < MIN_CALIBRATION_SAMPLES) {
    return { sensitivity: 1.0, freshSamples, fatiguedSamples, calibrated: false };
  }

  const freshAvg = fresh.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / freshSamples;
  const fatiguedAvg = fatigued.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / fatiguedSamples;
  if (freshAvg <= 0) return { sensitivity: 1.0, freshSamples, fatiguedSamples, calibrated: true };

  // 10% fewer reps when tired maps to the default sensitivity of 1.0.
  const degradation = Math.max(0, (freshAvg - fatiguedAvg) / freshAvg);
  const sensitivity = Math.max(0.1, Math.min(2.0, degradation / 0.1));
  return { sensitivity, freshSamples, fatiguedSamples, calibrated: true };
}
