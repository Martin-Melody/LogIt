// Cheers arriving mid-workout (design canvas T2): a small pill under the header for 3 seconds,
// the cheer sound and a buzz. Several close together stack ("Alex and 2 others"). They come from
// the push (app open) or, without pushes, a check of the Inbox every 30 seconds while a workout
// runs. Each notification shows once.
import { get } from "svelte/store";
import { notificationsApi } from "@logit/core/api/socialApi";
import { authStore } from "$lib/api/authStore.svelte";
import { currentSession } from "$lib/stores/currentSession.store";
import { playSound } from "$lib/features/sound/sounds";
import { isTrainingNow } from "./trainingPresence";

const SHOW_MS = 3000;
const POLL_MS = 30_000;

export const cheerPill = $state<{ names: string[]; visible: boolean }>({ names: [], visible: false });

const seen = new Set<string>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** "Alex", "Alex and Riya", "Alex and 2 others". */
export function cheerText(names: string[]): string {
  if (names.length <= 1) return `${names[0] ?? "Someone"} is cheering you on`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are cheering you on`;
  return `${names[0]} and ${names.length - 1} others are cheering you on`;
}

/** A cheer arrived (from a push or the Inbox). `id` dedupes the two routes. */
export function cheerArrived(name: string, id?: string): void {
  if (id) {
    if (seen.has(id)) return;
    seen.add(id);
  }
  cheerPill.names = cheerPill.visible ? [...cheerPill.names, name] : [name];
  cheerPill.visible = true;
  playSound("cheer");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (cheerPill.visible = false), SHOW_MS);
}

async function poll(): Promise<void> {
  const session = get(currentSession);
  if (!authStore.isAuthenticated || !isTrainingNow(session, Date.now())) return;
  try {
    const { notifications } = await notificationsApi.list();
    for (const n of notifications) {
      if (n.type !== "Cheer" || seen.has(n.id)) continue;
      if (new Date(n.createdAt).getTime() < session!.startedAtMs) {
        seen.add(n.id);
        continue;
      }
      cheerArrived(n.actor.displayName || n.actor.username, n.id);
    }
  } catch {
    // Next time.
  }
}

export function startCheers(): void {
  if (started) return;
  started = true;
  setInterval(() => document.visibilityState === "visible" && void poll(), POLL_MS);
}
