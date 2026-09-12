/**
 * Structured "show your work" data any progression or analytics algorithm can attach
 * to its output — the inputs it looked at, the numbers it computed from them, how much
 * to trust the result, and the verdict those numbers produced.
 *
 * Exists so a status chip or suggested weight is never just a bare assertion: a
 * developer debugging the built-in engine and a user squinting at a nudge in their
 * workout get the same generic "Why?" view, driven by this same shape, regardless of
 * whether the algorithm behind it is built-in or a community plugin. See
 * docs/architecture/adaptive-progression-engine.md.
 */
export type ReasoningConfidence = "low" | "medium" | "high";

export type Reasoning = {
  /** Raw values the reasoning looked at, e.g. `{ pointsConsidered: 6, sessionsSincePr: 4 }`. */
  inputs: Record<string, number | string | boolean>;
  /** Numbers derived from the inputs, e.g. `{ slopePctPerSession: 0.018 }`. */
  computed: Record<string, number>;
  /**
   * How much history/data supports this verdict — NOT a measure of how favorable the
   * verdict is. A confidently-detected regression and a confidently-detected plateau are
   * both "high"; a plateau guessed from two noisy sessions is "low" either way.
   */
  confidence: ReasoningConfidence;
  /** The label/decision this reasoning produced, restated for display next to the raw numbers. */
  verdict: string;
};
