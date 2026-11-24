// Settings › Notifications: the account's push choices, shared by the page and its sub-pages
// (likes, quiet mode). Changes show at once and are sent to the server; a failure puts the
// last saved value back.
import { pushApi, type PushSettings, type PushSettingsChange } from "@logit/core/api/pushApi";
import { toast } from "$lib/components/ui/sonner/index";

export const pushSettings = $state<{ value: PushSettings | null; error: boolean }>({ value: null, error: false });

export async function loadPushSettings(): Promise<void> {
  try {
    pushSettings.value = await pushApi.settings();
    pushSettings.error = false;
  } catch {
    pushSettings.error = pushSettings.value === null;
  }
}

export async function changePushSettings(change: PushSettingsChange): Promise<void> {
  const before = pushSettings.value;
  if (before) {
    const { resume, ...rest } = change;
    pushSettings.value = { ...before, ...rest, ...(resume ? { pausedUntil: null } : {}) };
  }
  try {
    pushSettings.value = await pushApi.update(change);
  } catch {
    pushSettings.value = before;
    toast.error("Couldn't save that. Check your connection and try again.");
  }
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 1320 → "22:00". */
export const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** "Every night, 22:00 to 07:00" or "Mon, Tue and Fri, 22:00 to 07:00". */
export function quietSummary(s: Pick<PushSettings, "quietDays" | "quietFromMinute" | "quietToMinute">): string {
  const days = DAY_SHORT.filter((_, i) => s.quietDays & (1 << i));
  const when = days.length === 7 ? "Every night"
    : days.length === 0 ? "No days"
    : days.length === 1 ? days[0]
    : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
  return `${when}, ${clock(s.quietFromMinute)} to ${clock(s.quietToMinute)}`;
}

export const AUDIENCE_LABEL = { Off: "Off", Following: "From people you follow", Everyone: "From everyone" } as const;
