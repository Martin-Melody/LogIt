// Shared by the board pages: "Mon 23 – Sun 29 Nov" (the month once, or on both ends across a month).
export function weekText(mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const mon = new Date(y!, m! - 1, d!);
  const sun = new Date(y!, m! - 1, d! + 6);
  const day = (x: Date) => `${x.toLocaleDateString(undefined, { weekday: "short" })} ${x.getDate()}`;
  const month = (x: Date) => x.toLocaleDateString(undefined, { month: "short" });
  return mon.getMonth() === sun.getMonth() ? `${day(mon)} – ${day(sun)} ${month(sun)}` : `${day(mon)} ${month(mon)} – ${day(sun)} ${month(sun)}`;
}
