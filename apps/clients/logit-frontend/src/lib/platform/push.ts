// Push notifications on the phone (Firebase via @capacitor/push-notifications). The server
// decides what to send and when (bundling, quiet mode, pause); this file only:
// - makes the Android channels, one per kind (canvas P4), so people can also silence a kind in Android;
// - registers the phone's token with the signed-in account once Android allows notifications,
//   and again whenever the app comes back (they may have just allowed it in Android's settings);
// - opens the right screen when a push is tapped;
// - asks Android only after LogIt has said what it's for (Inbox card P3, the reminder step), once.
import { registerPlugin } from "@capacitor/core";
import { goto } from "$app/navigation";
import { pushApi } from "@logit/core/api/pushApi";
import { log } from "@logit/core/platform/log";
import { isNativePlatform } from "./isNative";

export type PushPermission = "granted" | "denied" | "prompt" | "unavailable";

const CHANNELS = [
  { id: "messages", name: "Messages", description: "When your coach or client messages you", importance: 4 as const },
  { id: "coaching", name: "Coaching", description: "Programs, invites and payment problems", importance: 4 as const },
  { id: "social", name: "Social", description: "Likes, comments and follows, gathered a few times a day", importance: 3 as const },
];

/** The Inbox card (P3) was answered: never shown again. */
const ASKED_KEY = "logit:push-asked";

const AppSettings = registerPlugin<{ openNotificationSettings(): Promise<void> }>("AppSettings");

let started = false;
let token: string | null = null;
let sending: string | null = null;

// The module, not the plugin: a Capacitor plugin is a proxy that answers to any property,
// `then` included, so returning it from an async function never resolves.
const pushModule = () => import("@capacitor/push-notifications");

export async function pushPermission(): Promise<PushPermission> {
  if (!isNativePlatform()) return "unavailable";
  try {
    const { receive } = await (await pushModule()).PushNotifications.checkPermissions();
    return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
  } catch {
    return "unavailable";
  }
}

/** Once signed in (startBackgroundSync): channels, listeners, and the token if Android allows. */
export async function startPush(): Promise<void> {
  if (started || !isNativePlatform()) return;
  started = true;
  try {
    const { PushNotifications: push } = await pushModule();
    for (const c of CHANNELS) await push.createChannel(c);
    await push.addListener("registration", ({ value }) => {
      token = value;
      // Start and coming to the front can both register at once: one request per token is enough.
      if (sending === value) return;
      sending = value;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      pushApi.registerDevice(value, zone)
        .catch((e) => log.warn("push", "Couldn't register this phone for pushes", e))
        .finally(() => (sending = null));
    });
    await push.addListener("registrationError", (e) => log.warn("push", "Firebase registration failed", e));
    // In the app: no banner (the badge and Inbox update), only a fresh count.
    await push.addListener("pushNotificationReceived", (n) => {
      void import("$lib/stores/notifications.store").then((m) => m.unreadNotifications.refresh());
      // A cheer while LogIt is open shows as the workout pill, not a banner.
      const data = n.data as Record<string, string> | undefined;
      if (data?.type === "Cheer") {
        void import("$lib/features/friends/cheers.svelte").then((m) => m.cheerArrived(n.title ?? "A friend", data.notificationId));
      }
    });
    await push.addListener("pushNotificationActionPerformed", ({ notification }) => {
      void goto(pushTarget(notification.data as Record<string, string> | undefined));
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registerIfAllowed();
    });
    await registerIfAllowed();
  } catch (e) {
    log.warn("push", "Push setup failed", e);
  }
}

async function registerIfAllowed(): Promise<void> {
  if ((await pushPermission()) === "granted") await (await pushModule()).PushNotifications.register();
}

/** Android's question (P3 "Turn on"). Returns whether it said yes. */
export async function askForPush(): Promise<boolean> {
  markPushAsked();
  if (!isNativePlatform()) return false;
  try {
    const { PushNotifications } = await pushModule();
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== "granted") return false;
    await PushNotifications.register();
    return true;
  } catch {
    return false;
  }
}

export const pushAsked = () => localStorage.getItem(ASKED_KEY) === "1";
export const markPushAsked = () => localStorage.setItem(ASKED_KEY, "1");

/** P2: after a "no", Android's own switch is the way back. */
export async function openAndroidNotificationSettings(): Promise<void> {
  await AppSettings.openNotificationSettings().catch(() => {});
}

/** Before signing out (while the account's token still works), so this phone stops getting its pushes. */
export async function forgetPushDevice(): Promise<void> {
  if (!token) return;
  await pushApi.removeDevice(token).catch(() => {});
}

/** Where a tapped push goes; the same places as tapping it in the Inbox. */
export function pushTarget(data: Record<string, string> | undefined): string {
  const type = data?.type;
  if (type === "Message") return data?.relationshipId ? `/messages/${data.relationshipId}` : "/messages";
  if (type === "CoachInvite" || type === "CoachPaymentFailed") return "/clients";
  if (type === "CoachProgram") return "/splits";
  if (data?.count === "1" && data.postId) return `/social/post/${data.postId}`;
  return "/inbox";
}
