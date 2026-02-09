import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { toast } from "svelte-sonner";

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function hashToInt32(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0; // int32
  }
  // make positive (LocalNotifications id should be >= 0)
  return Math.abs(hash);
}

let didRequestNotifPerms = false;

export async function ensureRestNotificationPermissions(): Promise<boolean> {
  if (!isNative()) return false;

  // only ask once per app run
  if (didRequestNotifPerms) {
    const status = await LocalNotifications.checkPermissions();
    return status.display === "granted";
  }

  didRequestNotifPerms = true;

  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;

  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}

export async function scheduleRestEndNotification(args: {
  setId: string;
  endsAtMs: number;
  title?: string;
  body?: string;
}): Promise<void> {
  if (!isNative()) return;

  const ok = await ensureRestNotificationPermissions();
  if (!ok) return;

  const id = hashToInt32(args.setId);

  // Cancel any previous schedule for this set id
  await LocalNotifications.cancel({ notifications: [{ id }] });

  const when = new Date(args.endsAtMs);

  // If the end time is already in the past, don’t schedule
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return;

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: args.title ?? "Rest complete",
        body: args.body ?? "Time for the next set.",
        schedule: { at: when },
      },
    ],
  });
}

export async function cancelRestEndNotification(setId: string): Promise<void> {
  if (!isNative()) return;
  const id = hashToInt32(setId);
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

export async function fireRestFinishedFeedback(args: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}): Promise<void> {
  // Haptics only on native, toast works everywhere
  if (isNative()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // ignore
    }
  }

  toast.success(args.title ?? "Rest complete", {
    description: args.description ?? "Time for the next set.",
    action: args.actionLabel
      ? {
        label: args.actionLabel,
        onClick: () => args.onAction?.(),
      }
      : undefined,
  });
}

