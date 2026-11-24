/** "now", "4m", "2h", "Mon", "12 Nov": the age of a chat's last message, as Instagram lists them. */
export function shortAgo(ms: number, nowMs: number): string {
  const s = Math.max(0, (nowMs - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 6 * 86400) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A time line between messages when more than an hour passed ("Today 18:02", "Mon 09:15", "12 Nov 09:15"). */
export function dayTime(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const today = new Date(nowMs).toDateString() === d.toDateString();
  if (today) return `Today ${time}`;
  if (nowMs - ms < 6 * 86400_000) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}
