/** A shared PR as one line: "200 kg × 1 rep", "100 kg × 5 reps", or "12 reps" with no weight. */
export function prText(weight: number | null | undefined, unit: string | null | undefined, reps: number | null | undefined): string {
  const repsPart = reps ? `${reps} ${reps === 1 ? "rep" : "reps"}` : "";
  if (!weight) return repsPart;
  const load = `${weight} ${unit || "kg"}`;
  return repsPart ? `${load} × ${repsPart}` : load;
}
