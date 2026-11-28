import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { dayForWeek, getProgramProgress, type CoachProgram } from "@logit/core/domain/CoachProgram";

// Who sees how-tos (canvas HT3): the coach's program setting wins; by default, new lifters, from
// their LogIt setup ("I'm new" or under 2 years; not answered counts as new).
export function showsHowTos(program: Pick<CoachProgram, "howtoShow"> | null): boolean {
  const show = program?.howtoShow ?? "new";
  if (show !== "new") return show === "always";
  try {
    const exp = (JSON.parse(getAccountItem("logit:onboarding:answers") ?? "{}") as { experience?: string }).experience;
    return !exp || exp === "new" || exp === "under2";
  } catch {
    return true;
  }
}

/** The exercises in the program's first week, in the order they'll meet them. */
export function firstWeekExercises(program: CoachProgram): { name: string; exerciseId?: string; day: string }[] {
  const w = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber)[0];
  const out: { name: string; exerciseId?: string; day: string }[] = [];
  for (const d of [...(w?.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const b of [...dayForWeek(d, w!.weekNumber).blocks].sort((a, c) => a.orderIndex - c.orderIndex)) {
      if (b.type === "strength" && !out.some((x) => x.name.toLowerCase() === b.exerciseName.toLowerCase())) out.push({ name: b.exerciseName, exerciseId: b.exerciseId, day: d.name?.trim() || `Day ${d.orderIndex + 1}` });
    }
  }
  return out;
}

/** Before it starts, or in its first week. */
export function inFirstWeek(program: CoachProgram): boolean {
  const p = getProgramProgress(program);
  return p.status === "not-started" || p.status === "scheduled" || (p.status === "running" && p.weekNumber === 1);
}

export const WORKING_WEIGHT = "__working-weight";
const key = (programId: string) => `logit:howtos-read:${programId}`;
export function readHowTos(programId: string): string[] {
  try { return JSON.parse(getAccountItem(key(programId)) ?? "[]") as string[]; } catch { return []; }
}
export function markHowToRead(programId: string, name: string): string[] {
  const next = [...new Set([...readHowTos(programId), name.toLowerCase()])];
  setAccountItem(key(programId), JSON.stringify(next));
  return next;
}
