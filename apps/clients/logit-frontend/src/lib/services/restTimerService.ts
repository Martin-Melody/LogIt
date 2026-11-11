import { get } from "svelte/store";
import { toast } from "$lib/components/ui/sonner/index";
import { goto } from "$app/navigation";
import { currentSession } from "$lib/stores/currentSession.store";
import { profile } from "$lib/stores/profile.store";
import { clearRest, getRunningRests, type RunningRest, type WorkoutSession } from "@logit/core/domain/workout";

// ── The rest timer ────────────────────────────────────────────────────────────
// A set's `restStartedAtMs` is the only record of a running rest. The session blocks set it
// when a set is ticked and clear it on dismiss or untick; everything else follows from it:
//
// - This service watches the in-progress session. For each running rest it keeps one in-app
//   timeout and one phone notification for the moment the rest ends, and cancels both when
//   the rest goes away. When a rest ends it shows the toast (once) and clears the rest.
// - The progress bars only display.
//
// It used to be tracked in four places (the set, a map of timers here with a "fired" flag,
// each progress bar's own "done" flag, and the notification), kept in step by hand: a rest
// that ended before a reload toasted again after it, and a rest that ended while the app was
// in the background could alert twice.

/** A timeout that fires this much after the rest's end ran while the app was in the
 * background (timers pause there), so the phone notification has already alerted. */
const LATE_MS = 2_000;

type Scheduled = { endsAtMs: number; timeoutId: ReturnType<typeof setTimeout> };
const scheduled = new Map<string, Scheduled>();
let started = false;

/** Start following the in-progress session's rests. Safe to call more than once. */
export function startRestTimers(): void {
  if (started) return;
  started = true;
  currentSession.subscribe((session) => reconcile(session));
  // A rest's length can follow the profile's defaults.
  profile.subscribe(() => reconcile(get(currentSession)));
}

function reconcile(session: WorkoutSession | null): void {
  const now = Date.now();
  const running = session ? getRunningRests(session, get(profile).restDefaults) : [];
  const live = new Set(running.map((r) => r.setId));

  // Rests that were dismissed, unticked, deleted or finished with the workout.
  for (const [setId, entry] of scheduled) {
    if (live.has(setId)) continue;
    clearTimeout(entry.timeoutId);
    scheduled.delete(setId);
    void cancelOsNotification(setId);
  }

  for (const rest of running) {
    const existing = scheduled.get(rest.setId);
    if (existing?.endsAtMs === rest.endsAtMs) continue;
    if (existing) clearTimeout(existing.timeoutId);

    if (rest.endsAtMs <= now) {
      // Already over: it ended before a reload, or while the app was closed. The phone
      // notification (if any) has done its job; just tidy up, no toast.
      scheduled.delete(rest.setId);
      void finish(rest, { alert: false });
      continue;
    }

    const timeoutId = setTimeout(() => {
      const late = Date.now() - rest.endsAtMs > LATE_MS;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      void finish(rest, { alert: !late && !hidden });
    }, rest.endsAtMs - now);
    scheduled.set(rest.setId, { endsAtMs: rest.endsAtMs, timeoutId });
    void scheduleOsNotification(rest.setId, rest.endsAtMs);
  }
}

async function finish(rest: RunningRest, { alert }: { alert: boolean }): Promise<void> {
  scheduled.delete(rest.setId);
  if (alert) {
    // In the foreground the toast takes over from the phone notification.
    void cancelOsNotification(rest.setId);
    void buzz();
    const onSessionPage = typeof location !== "undefined" && location.pathname.startsWith("/session/current");
    toast("Rest complete — time for your next set!", onSessionPage
      ? undefined
      : { action: { label: "Go to session", onClick: () => void goto("/session/current") } });
  }
  // Only this rest: if the set was re-ticked meanwhile, its new rest keeps running.
  await currentSession.mutate((s) => clearRest(s, rest.setId, rest.startedAtMs)).catch(() => {});
}

async function buzz(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

// ── Phone notification ────────────────────────────────────────────────────────

function notifId(setId: string): number {
  let h = 5381;
  for (let i = 0; i < setId.length; i++) {
    h = ((h << 5) + h + setId.charCodeAt(i)) & 0x7fffffff;
  }
  return h || 1;
}

const REST_CHANNEL_ID = "rest-timer";
let channelReady: Promise<void> | null = null;

/**
 * A MAX-importance channel so the "rest done" alert pops as a heads-up with
 * sound + vibration even when the app is backgrounded — a normal-importance
 * notification is easy to miss mid-set.
 */
async function ensureRestChannel(): Promise<void> {
  channelReady ??= (async () => {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      if (!LocalNotifications.createChannel) return; // iOS / web
      await LocalNotifications.createChannel({
        id: REST_CHANNEL_ID,
        name: "Rest timer",
        description: "Alerts when a rest period finishes",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: undefined, // default alarm/notification sound
      });
    } catch {}
  })();
  return channelReady;
}

/** Schedule (or move) the set's notification. The same id replaces any pending one, so
 * scheduling again after a reload doesn't stack a second alert. */
async function scheduleOsNotification(setId: string, atMs: number) {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;
    await ensureRestChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId(setId),
          title: "Rest complete",
          body: "Time to start your next set!",
          channelId: REST_CHANNEL_ID,
          smallIcon: "ic_stat_logit",
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
  } catch {}
}

async function cancelOsNotification(setId: string) {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: notifId(setId) }] });
  } catch {}
}
