import { goto } from "$app/navigation";
import { get } from "svelte/store";
import { assignedPrograms } from "$lib/stores/assignedPrograms.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { getCoachProgramRepo } from "$lib/data/repoProvider";
import { listRecentSessions } from "$lib/usecases/listRecentSessions";
import { programToday, type ProgramToday } from "@logit/core/domain/programToday";
import type { ProgramDay } from "@logit/core/domain/CoachProgram";

/** The coach's program that's running now (decision D2: it leads Home and Start over the
 * client's own split), the one they last trained first; null without one. */
export async function coachedToday(nowMs = Date.now()): Promise<ProgramToday | null> {
  const [programs, sessions, activeId] = await Promise.all([
    assignedPrograms.refresh(),
    listRecentSessions(30),
    getCoachProgramRepo().getActiveProgramId().catch(() => null),
  ]);
  return programs
    .map((p) => programToday(p, sessions, nowMs))
    .filter((t): t is ProgramToday => t !== null)
    .sort((a, b) => Number(b.program.id === activeId) - Number(a.program.id === activeId))[0] ?? null;
}

/** Starts a day of the coach's program (or opens the running workout). */
export async function startCoachedDay(coached: ProgramToday, day: ProgramDay, coachId?: string): Promise<void> {
  if (get(currentSession) !== null) return void goto("/session/current");
  const p = coached.program;
  await getCoachProgramRepo().setActiveProgramId(p.id);
  await currentSession.startFromProgramDay(day, { id: p.id, name: p.name, coachId: p.coachId ?? coachId });
  await goto("/session/current");
}
