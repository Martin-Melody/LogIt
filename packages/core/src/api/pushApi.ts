import { apiClient } from "./client";

/** Who a like or comment push may come from (Instagram's three choices). */
export type PushAudience = "Off" | "Following" | "Everyone";

/** Settings › Notifications, as the server keeps it. Times are minutes after midnight in the
 * phone's zone; `quietDays` has bit 0 = Monday … bit 6 = Sunday. */
export interface PushSettings {
  /** The server can push (its own Firebase key, or the relay is on). */
  available: boolean;
  likes: PushAudience;
  comments: PushAudience;
  follows: boolean;
  messages: boolean;
  coaching: boolean;
  /** ISO time while "Pause all" lasts, else null. */
  pausedUntil: string | null;
  quietOn: boolean;
  quietFromMinute: number;
  quietToMinute: number;
  quietDays: number;
  timeZone: string;
}

export type PushSettingsChange = Partial<Omit<PushSettings, "available" | "timeZone" | "pausedUntil">> & {
  pausedUntil?: string;
  resume?: boolean;
};

export const pushApi = {
  /** On every start while signed in; a token another account held moves to this one. */
  async registerDevice(token: string, timeZone: string): Promise<void> {
    await apiClient.fetch("/push/devices", { method: "PUT", body: JSON.stringify({ token, platform: "android", timeZone }) });
  },

  /** Before signing out, so the next person on the phone doesn't get this account's pushes. */
  async removeDevice(token: string): Promise<void> {
    await apiClient.fetch("/push/devices/remove", { method: "POST", body: JSON.stringify({ token }) });
  },

  async settings(): Promise<PushSettings> {
    return apiClient.fetch("/push/settings");
  },

  /** Only the fields given change. */
  async update(change: PushSettingsChange): Promise<PushSettings> {
    return apiClient.fetch("/push/settings", { method: "PUT", body: JSON.stringify(change) });
  },
};
