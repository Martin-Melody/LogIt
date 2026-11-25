// Sends this week's board numbers (design canvas G4, B2): from the weekly streak and finished
// workouts' volume, never the workouts. On start, after a workout and before a board is shown;
// the same numbers aren't sent twice.
import { boardsApi, type BoardWeek } from "@logit/core/api/boardsApi";
import { volumeVsUsual } from "@logit/core/domain/boardWeek";
import { getSessionVolumeKg } from "@logit/core/domain/workout";
import { authStore } from "$lib/api/authStore.svelte";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { loadWeeklyStreak } from "$lib/features/goals/streak";

const SENT_KEY = "logit:board-week-sent";

export async function thisBoardWeek(nowMs = Date.now()): Promise<BoardWeek> {
  const streak = await loadWeeklyStreak(nowMs);
  const [y, m, d] = streak.thisWeek.startIso.split("-").map(Number);
  const weekStartMs = new Date(y!, m! - 1, d!).getTime();
  const sessions = (await getWorkoutRepo().listAllSessions()).filter((s) => s.endedAtMs != null && s.startedAtMs >= weekStartMs - 28 * 86_400_000);
  return {
    week: streak.thisWeek.startIso,
    done: streak.thisWeek.done,
    planned: streak.thisWeek.needed,
    weeksKept: streak.currentWeeks,
    volumePct: volumeVsUsual(sessions.map((s) => ({ startedAtMs: s.startedAtMs, volumeKg: getSessionVolumeKg(s) })), weekStartMs),
    rest: streak.thisWeek.needed === 0,
  };
}

export async function sendBoardWeek(): Promise<void> {
  if (!authStore.isAuthenticated) return;
  try {
    const week = await thisBoardWeek();
    const json = JSON.stringify(week);
    if (getAccountItem(SENT_KEY) === json) return;
    await boardsApi.send(week);
    setAccountItem(SENT_KEY, json);
  } catch {
    // Offline or an older server: the next start or workout tries again.
  }
}

let sentThisRun = false;
/** Once per app start (the layout calls this on every page change). */
export function sendBoardWeekOnce(): void {
  if (sentThisRun) return;
  sentThisRun = true;
  void sendBoardWeek();
}
