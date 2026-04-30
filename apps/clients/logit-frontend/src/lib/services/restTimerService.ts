import { toast } from "$lib/components/ui/sonner/index";
import { goto } from "$app/navigation";

// ── Notification helpers ──────────────────────────────────────────────────────

function notifId(setId: string): number {
  let h = 5381;
  for (let i = 0; i < setId.length; i++) {
    h = ((h << 5) + h + setId.charCodeAt(i)) & 0x7fffffff;
  }
  return h || 1;
}

async function scheduleOsNotification(setId: string, restMs: number) {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId(setId),
          title: "Rest complete",
          body: "Time to start your next set!",
          schedule: { at: new Date(Date.now() + restMs), allowWhileIdle: true },
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

// ── In-app timer ──────────────────────────────────────────────────────────────

type Entry = { timeoutId: ReturnType<typeof setTimeout>; fired: boolean };
const timers = new Map<string, Entry>();

/**
 * Start an in-app rest timer for a set. Also schedules an OS notification as a
 * fallback for when the app is backgrounded (JS timers pause). When the JS
 * timer fires first (app in foreground) it cancels the OS notification and
 * shows an in-app toast instead.
 */
export function startRestTimer(setId: string, restMs: number): void {
  // Clear any existing timer for this set before starting a new one.
  const existing = timers.get(setId);
  if (existing) clearTimeout(existing.timeoutId);
  timers.delete(setId);

  void scheduleOsNotification(setId, restMs);

  const timeoutId = setTimeout(async () => {
    const entry = timers.get(setId);
    if (entry) entry.fired = true;

    // App is in foreground — cancel the OS notification, use toast instead.
    void cancelOsNotification(setId);

    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}

    toast("Rest complete — time for your next set!", {
      action: {
        label: "Go to session",
        onClick: () => void goto("/session/current"),
      },
    });
  }, restMs);

  timers.set(setId, { timeoutId, fired: false });
}

/**
 * Cancel a pending rest timer and its OS notification. Safe to call even if
 * the timer has already fired or was never started.
 */
export function cancelRestTimer(setId: string): void {
  const entry = timers.get(setId);
  if (!entry) return;
  clearTimeout(entry.timeoutId); // no-op if already fired
  timers.delete(setId);
  void cancelOsNotification(setId);
}

/**
 * Returns true if the in-app timer already fired and showed its own toast.
 * Use this in RestProgressBar's onDone handler to avoid a double-toast.
 */
export function hasRestTimerFired(setId: string): boolean {
  return timers.get(setId)?.fired ?? false;
}
