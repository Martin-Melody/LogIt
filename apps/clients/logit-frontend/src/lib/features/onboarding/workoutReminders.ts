// "Remind me on those days" (design canvas O5): a notification on each training day at the
// time the person picked, with that day's workout. Set up after the first workout. Android's
// permission is asked only after the app has said what the reminders are, and a "no" is never
// asked again. Kept per account; switching account reschedules for the one now in use.
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { onActiveOwnerChange } from "$lib/data/activeOwner";
import { isNativePlatform } from "$lib/platform/isNative";
import { log } from "@logit/core/platform/log";

const KEY = "logit:reminders:workout";
const CHANNEL_ID = "workout-reminders";
/** Notification ids 9100–9106, one per weekday (0 = Sunday). */
const ID_BASE = 9100;

export type WorkoutReminders = {
  on: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** "07:00". */
  time: string;
  /** What each weekday's reminder names: the workout planned that day. */
  dayNames?: Record<number, string>;
  /** Android said no: never ask again. */
  permissionDenied?: boolean;
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getWorkoutReminders(): WorkoutReminders | null {
  try {
    const raw = getAccountItem(KEY);
    return raw ? (JSON.parse(raw) as WorkoutReminders) : null;
  } catch {
    return null;
  }
}

/** Weekdays in the order of a week starting on Monday. */
export function mondayFirst(weekdays: number[]): number[] {
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** "I'll train Mon, Tue, Thu and Fri at 7:00." */
export function reminderSentence(weekdays: number[], time: string): string {
  const days = mondayFirst(weekdays).map((d) => DAY_SHORT[d]!);
  const list = days.length <= 1 ? (days[0] ?? "") : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
  return `I'll train ${list} at ${time.replace(/^0(\d)/, "$1")}.`;
}

export function canRemind(): boolean {
  return isNativePlatform();
}

/**
 * Saves the reminders and schedules them. Returns "denied" when Android says no (or said no
 * before), so the screen can say reminders are off.
 */
export async function setWorkoutReminders(r: WorkoutReminders): Promise<"scheduled" | "off" | "denied"> {
  let saved: WorkoutReminders = { ...r };
  let result: "scheduled" | "off" | "denied" = "off";
  if (r.on && canRemind()) {
    if (r.permissionDenied) {
      result = "denied";
    } else {
      const granted = await askPermission();
      if (!granted) {
        saved = { ...saved, on: false, permissionDenied: true };
        result = "denied";
      } else {
        await schedule(saved);
        result = "scheduled";
      }
    }
  }
  if (result !== "scheduled") await cancelAll();
  setAccountItem(KEY, JSON.stringify(saved));
  return result;
}

async function askPermission(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (current.display === "denied") return false;
    return (await LocalNotifications.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

async function schedule(r: WorkoutReminders): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await cancelAll();
    if (LocalNotifications.createChannel) {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "Workout reminders",
        description: "On the days you said you'd train",
        importance: 3,
      });
    }
    const [hour, minute] = r.time.split(":").map((n) => parseInt(n, 10));
    await LocalNotifications.schedule({
      notifications: r.weekdays.map((wd) => ({
        id: ID_BASE + wd,
        title: r.dayNames?.[wd] ? `${r.dayNames[wd]} today` : "Training today",
        body: "Your workout is ready when you are.",
        channelId: CHANNEL_ID,
        smallIcon: "ic_stat_logit",
        // Capacitor counts weekdays from Sunday = 1.
        schedule: { on: { weekday: wd + 1, hour: hour ?? 7, minute: minute ?? 0 }, allowWhileIdle: true },
      })),
    });
  } catch (e) {
    log.warn("reminders", "Couldn't schedule workout reminders", e);
  }
}

async function cancelAll(): Promise<void> {
  if (!canRemind()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ id: ID_BASE + wd })) });
  } catch {
    // Nothing scheduled.
  }
}

// Reminders belong to an account: the one now in use gets its own (or none).
onActiveOwnerChange(() => {
  if (!canRemind()) return;
  const r = getWorkoutReminders();
  if (r?.on && !r.permissionDenied) void schedule(r);
  else void cancelAll();
});
