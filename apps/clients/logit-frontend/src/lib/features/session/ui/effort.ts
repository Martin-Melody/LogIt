// Effort in plain words (design canvas S-C, S-D): "how many more could you have done?",
// saved as RPE. 3+ left = RPE 7, 2 = 8, 1 = 9, none = 10.
export const EFFORT = [
  { left: "3+", rpe: 7 },
  { left: "2", rpe: 8 },
  { left: "1", rpe: 9 },
  { left: "0", rpe: 10 },
] as const;

/** Which answer an RPE reads as (half points round down to the easier one). */
export function effortFor(rpe: number | null | undefined): (typeof EFFORT)[number] | null {
  if (rpe == null) return null;
  if (rpe >= 10) return EFFORT[3];
  if (rpe >= 9) return EFFORT[2];
  if (rpe >= 8) return EFFORT[1];
  return EFFORT[0];
}

/** "2 left" under a set's reps. */
export function effortLabel(rpe: number | null | undefined): string {
  const e = effortFor(rpe);
  return e ? `${e.left} left` : "";
}
