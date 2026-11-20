import { get } from "svelte/store";
import { toast } from "$lib/components/ui/sonner/index";
import { goto } from "$app/navigation";
import { currentSession } from "$lib/stores/currentSession.store";
import { profile } from "$lib/stores/profile.store";
import { clearRest, getRunningRests, type RunningRest, type WorkoutSession } from "@logit/core/domain/workout";
import { playSound } from "$lib/features/sound/sounds";

// ── The rest timer ────────────────────────────────────────────────────────────
// A set's `restStartedAtMs` is the only record of a running rest. The session blocks set it
// when a set is ticked and clear it on dismiss or untick; everything else follows from it:
//
// - This service watches the in-progress session. For each running rest it keeps one in-app
//   timeout for the moment the rest ends, and cancels it when the rest goes away. When a rest
//   ends in the app it chimes and shows the toast (once) and clears the rest.
// - The phone notification is only booked while the app is in the background, and taken back
//   when it returns. Booked all along, it fired alongside the in-app chime: cancelling it at
//   the end of the rest lost the race to Android (Martin, 2026-11-19).
// - The progress bars only display.
//
// It used to be tracked in four places (the set, a map of timers here with a "fired" flag,
// each progress bar's own "done" flag, and the notification), kept in step by hand: a rest
// that ended before a reload toasted again after it, and a rest that ended while the app was
// in the background could alert twice.

/** A timeout that fires this much after the rest's end ran while the app was in the
 * background (timers pause there), so the phone notification has already alerted. */
const LATE_MS = 2_000;

type Scheduled = { endsAtMs: number; timeoutId: ReturnType<typeof setTimeout>; warnId?: ReturnType<typeof setTimeout> };
/** "10 seconds left": one soft Iron tick (rests longer than 20 s only). */
const WARN_MS = 10_000;
const scheduled = new Map<string, Scheduled>();
let started = false;

const inBackground = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Start following the in-progress session's rests. Safe to call more than once. */
export function startRestTimers(): void {
  if (started) return;
  started = true;
  currentSession.subscribe((session) => reconcile(session));
  // A rest's length can follow the profile's defaults.
  profile.subscribe(() => reconcile(get(currentSession)));
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
}

/** Leaving the app books a phone notification for each running rest; coming back takes them
 * back, so in the app it's only the chime and the toast. */
function onVisibility(): void {
  const now = Date.now();
  for (const [setId, entry] of scheduled) {
    if (inBackground()) {
      if (entry.endsAtMs > now) void scheduleOsNotification(setId, entry.endsAtMs);
    } else {
      void cancelOsNotification(setId);
    }
  }
}

function reconcile(session: WorkoutSession | null): void {
  const now = Date.now();
  const running = session ? getRunningRests(session, get(profile).restDefaults) : [];
  const live = new Set(running.map((r) => r.setId));

  // Rests that were dismissed, unticked, deleted or finished with the workout.
  for (const [setId, entry] of scheduled) {
    if (live.has(setId)) continue;
    clearTimeout(entry.timeoutId);
    if (entry.warnId) clearTimeout(entry.warnId);
    scheduled.delete(setId);
    void cancelOsNotification(setId);
  }

  for (const rest of running) {
    const existing = scheduled.get(rest.setId);
    if (existing?.endsAtMs === rest.endsAtMs) continue;
    if (existing) {
      clearTimeout(existing.timeoutId);
      if (existing.warnId) clearTimeout(existing.warnId);
    }

    if (rest.endsAtMs <= now) {
      // Already over: it ended before a reload, or while the app was closed. The phone
      // notification (if any) has done its job; just tidy up, no toast.
      scheduled.delete(rest.setId);
      void finish(rest, { alert: false });
      continue;
    }

    const timeoutId = setTimeout(() => {
      const late = Date.now() - rest.endsAtMs > LATE_MS;
      void finish(rest, { alert: !late && !inBackground() });
    }, rest.endsAtMs - now);
    const warnAt = rest.endsAtMs - WARN_MS;
    const warnId = rest.endsAtMs - rest.startedAtMs > 2 * WARN_MS && warnAt > now
      ? setTimeout(() => {
          if (typeof document === "undefined" || document.visibilityState !== "hidden") playSound("warn");
        }, warnAt - now)
      : undefined;
    scheduled.set(rest.setId, { endsAtMs: rest.endsAtMs, timeoutId, warnId });
    // A rest started or moved while the app is in the background (e.g. from a widget).
    if (inBackground()) void scheduleOsNotification(rest.setId, rest.endsAtMs);
    else void cancelOsNotification(rest.setId);
  }
}

async function finish(rest: RunningRest, { alert }: { alert: boolean }): Promise<void> {
  scheduled.delete(rest.setId);
  if (alert) {
    playSound("rest");
    const onSessionPage = typeof location !== "undefined" && location.pathname.startsWith("/session/current");
    toast("Rest complete — time for your next set!", onSessionPage
      ? undefined
      : { action: { label: "Go to session", onClick: () => void goto("/session/current") } });
  }
  // Only this rest: if the set was re-ticked meanwhile, its new rest keeps running.
  await currentSession.mutate((s) => clearRest(s, rest.setId, rest.startedAtMs), { auto: true }).catch(() => {});
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
    // Without the exact-alarm permission the plugin opens "Alarms & reminders" settings on every
    // schedule (blocked in the background, then pops over the app). Ask for exact only when granted.
    const exact = await LocalNotifications.checkExactNotificationSetting().then((r) => r.exact_alarm === "granted", () => true);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId(setId),
          title: "Rest complete",
          body: "Time to start your next set!",
          channelId: REST_CHANNEL_ID,
          smallIcon: "ic_stat_logit",
          schedule: { at: new Date(atMs), allowWhileIdle: true },
          isExactNotification: exact,
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
