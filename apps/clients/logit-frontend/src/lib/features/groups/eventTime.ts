// How event times read (design canvas G1, G2, E2): in the phone's own time zone.
const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Saturday 29 November, 9:00–10:30". */
export function eventWhen(e: { startsAtMs: number; endsAtMs: number | null }): string {
  const day = new Date(e.startsAtMs).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return `${day}, ${time(e.startsAtMs)}${e.endsAtMs ? `–${time(e.endsAtMs)}` : ""}`;
}

/** "Sat 9:00" within the next week, else "Sat 13 Dec, 9:00". */
export function eventShort(startsAtMs: number, now = Date.now()): string {
  const d = new Date(startsAtMs);
  const soon = startsAtMs - now < 6 * 86_400_000;
  const day = d.toLocaleDateString(undefined, soon ? { weekday: "short" } : { weekday: "short", day: "numeric", month: "short" });
  return `${day}${soon ? "" : ","} ${time(startsAtMs)}`;
}

/** The date block: "29" over "Nov". */
export function dayBadge(startsAtMs: number): { day: string; month: string } {
  const d = new Date(startsAtMs);
  return { day: String(d.getDate()), month: d.toLocaleDateString(undefined, { month: "short" }) };
}

/** "2 days and 14 hours" as parts for the Home countdown; null once it has started. */
export function countdown(startsAtMs: number, now = Date.now()): { days: number; hours: number; minutes: number } | null {
  const left = startsAtMs - now;
  if (left <= 0) return null;
  return { days: Math.floor(left / 86_400_000), hours: Math.floor((left % 86_400_000) / 3_600_000), minutes: Math.floor((left % 3_600_000) / 60_000) };
}
