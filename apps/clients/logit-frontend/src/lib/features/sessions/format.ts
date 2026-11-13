import type { WeightUnit } from "@logit/core/domain/units";
import { formatWeight, toDisplayWeight } from "@logit/core/domain/units";
import type { LiftChange, PlanRow } from "@logit/core/domain/sessionHistory";

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", "Tuesday" this past week, else "Fri 6 Nov" (and the year when not this one). */
export function dayLabel(ms: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(ms);
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Friday 13 November" (with the year when not this one). */
export function longDayLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

export function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "58 min", "1 h 4 min". */
export function durationLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

function signed(n: number, text: string): string {
  return `${n > 0 ? "+" : "−"}${text}`;
}

function repsText(n: number): string {
  const a = Math.abs(n);
  return `${a} rep${a === 1 ? "" : "s"}`;
}

/** "+2.5 kg", "+2 reps", "−5 kg, +3 reps", "+5 s", "same", "first time". */
export function changeLabel(change: LiftChange, unit: WeightUnit, metric: "hold" | "reps" | null = null): string {
  if (change.kind === "new") return "first time";
  if (change.kind === "same") return "same";
  if (change.secondsDelta != null) {
    return metric === "reps" ? signed(change.secondsDelta, repsText(change.secondsDelta)) : signed(change.secondsDelta, `${Math.abs(change.secondsDelta)} s`);
  }
  const parts: string[] = [];
  if (change.weightDelta) parts.push(signed(change.weightDelta, formatWeight(Math.abs(change.weightDelta), unit)));
  if (change.repsDelta) parts.push(signed(change.repsDelta, repsText(change.repsDelta)));
  return parts.join(", ") || "same";
}

/** Tailwind classes for a change: green up, orange down, muted otherwise. */
export function changeClass(kind: LiftChange["kind"]): string {
  if (kind === "up") return "bg-success/10 text-success";
  if (kind === "down") return "bg-warning/10 text-warning";
  return "text-muted-foreground";
}

/** "1 set short, 5 kg lighter", "+1 rep", "" when as planned. */
export function planRowDetail(row: PlanRow, unit: WeightUnit, metric: "hold" | "reps" | null = null): string {
  const parts: string[] = [];
  const unitWord = metric === "hold" ? "s" : null;
  if (row.setsShort) parts.push(`${row.setsShort} ${row.item.type === "mobility" ? "round" : "set"}${row.setsShort === 1 ? "" : "s"} short`);
  if (row.kgLighter) parts.push(`${formatWeight(row.kgLighter, unit)} lighter`);
  if (row.repsShort) parts.push(unitWord ? `${row.repsShort} s short` : `${repsText(row.repsShort)} short`);
  if (parts.length) return parts.join(", ");
  if (row.extraSets) parts.push(`${row.extraSets} extra ${row.item.type === "mobility" ? "round" : "set"}${row.extraSets === 1 ? "" : "s"}`);
  if (row.kgHeavier) parts.push(`${formatWeight(row.kgHeavier, unit)} heavier`);
  if (row.repsOver) parts.push(unitWord ? `+${row.repsOver} s` : `+${repsText(row.repsOver)}`);
  return parts.join(", ");
}

/** "3 × 5 · 142.5 kg", "8, 9, 8 · 110 kg", "3 × 10 · 100–110 kg" from sets. */
export function setsSummary(sets: { reps: number; weight: number }[], unit: WeightUnit, bodyweight = false): string {
  if (sets.length === 0) return "–";
  const reps = sets.map((s) => s.reps);
  const sameReps = reps.every((r) => r === reps[0]);
  const weights = sets.map((s) => s.weight);
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  const repsPart = sameReps ? `${sets.length} × ${reps[0]}` : reps.join(", ");
  if (bodyweight && hi === 0) return `${repsPart} · BW`;
  if (hi === 0) return repsPart;
  const w = lo === hi ? formatWeight(hi, unit) : `${formatWeight(lo, unit, { withUnit: false })}–${formatWeight(hi, unit)}`;
  return `${repsPart} · ${w}`;
}

/** "9,840 kg": a session's or week's volume, to the nearest whole unit. */
export function volumeLabel(kg: number, unit: WeightUnit): string {
  return `${Math.round(toDisplayWeight(kg, unit)).toLocaleString()} ${unit}`;
}
