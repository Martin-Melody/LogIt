const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "today 10:42", "yesterday", "Thu", "2 Nov". */
export function when(ms: number, now = Date.now(), withTime = false): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  const time = new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return withTime ? `today ${time}` : "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return shortDate(ms);
}

/** "2 h ago", "5 min ago", else when(). */
export function ago(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 12 * 60) return `${Math.round(min / 60)} h ago`;
  return when(ms, now);
}

export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function weekdayDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Whole days from `fromMs` to `toMs` (calendar days). */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY);
}

export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

/** "Month YYYY" when coaching started, or "" if unknown. */
export function sinceLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}
