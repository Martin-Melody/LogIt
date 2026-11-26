// Repeating events (design canvas V3): every week or every 2 weeks on chosen days, until a date.
// The dates are worked out on the phone, in local time, so a 7pm session stays at 7pm across the
// clock change; each date then becomes its own event on the server.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface RepeatRule {
  /** The first day, "YYYY-MM-DD". */
  firstDay: string;
  /** "HH:MM", and optionally when it ends ("HH:MM"; past midnight means the next day). */
  from: string;
  to?: string | null;
  /** Days of the week, 0 = Sunday. */
  days: number[];
  /** Every week (1) or every other week (2), counted from the first day's week. */
  every: 1 | 2;
  /** The last day it can fall on, "YYYY-MM-DD". */
  until: string;
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h!, m!);
};
/** Monday of the week a date is in (local), at midnight. */
const weekOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/** Every date the rule gives, at most `max` (the server takes 120). */
export function repeatDates(rule: RepeatRule, max = 120): { startsAt: Date; endsAt: Date | null }[] {
  const first = parseDay(rule.firstDay);
  const until = parseDay(rule.until);
  const start = weekOf(first);
  const out: { startsAt: Date; endsAt: Date | null }[] = [];
  for (let d = new Date(first); d <= until && out.length < max; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!rule.days.includes(d.getDay())) continue;
    const week = Math.round((weekOf(d).getTime() - start.getTime()) / (7 * 86_400_000));
    if (week % rule.every !== 0) continue;
    const startsAt = at(d, rule.from);
    let endsAt = rule.to ? at(d, rule.to) : null;
    if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getFullYear(), endsAt.getMonth(), endsAt.getDate() + 1, endsAt.getHours(), endsAt.getMinutes());
    out.push({ startsAt, endsAt });
  }
  return out;
}

/** "Every Tue and Thu", "Every 2 weeks on Sat". Days in week order, Monday first. */
export function repeatLabel(days: number[], every: 1 | 2): string {
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]);
  const list = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return every === 1 ? `Every ${list}` : `Every 2 weeks on ${list}`;
}
