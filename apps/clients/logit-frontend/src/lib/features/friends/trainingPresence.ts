// Tells the server "training now" while a workout runs, so friends see the green dot (design
// canvas S1/T1). Refreshed every 5 minutes (the server forgets it 20 minutes after the last),
// cleared when the workout ends or is thrown away. The server applies who may see it.
import { get } from "svelte/store";
import { trainingApi } from "@logit/core/api/trainingApi";
import { authStore } from "$lib/api/authStore.svelte";
import { currentSession } from "$lib/stores/currentSession.store";

const REFRESH_MS = 5 * 60 * 1000;
/** A workout left unfinished days ago isn't "training now". */
export const MAX_AGE_MS = 3 * 60 * 60 * 1000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let reported = false;

/** Whether a workout should count as training now. */
export function isTrainingNow(session: { startedAtMs: number; endedAtMs?: number | null } | null, nowMs: number): boolean {
  return !!session && !session.endedAtMs && nowMs - session.startedAtMs < MAX_AGE_MS;
}

export function startTrainingPresence(): void {
  if (started) return;
  started = true;
  currentSession.subscribe((session) => {
    const training = authStore.isAuthenticated && isTrainingNow(session, Date.now());
    if (training && !timer) {
      const send = () => {
        void trainingApi.start(get(currentSession)?.name ?? null).then(() => (reported = true), () => {});
      };
      send();
      timer = setInterval(send, REFRESH_MS);
    } else if (!training && timer) {
      clearInterval(timer);
      timer = null;
      if (reported) void trainingApi.stop().catch(() => {});
      reported = false;
    }
  });
}
