import { toDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";
import type { GoalView } from "./goalProgress";

/** How a goal's numbers are shown: in the lifter's weight unit for kg, as-is otherwise. */
export function goalFormat(view: GoalView, weightUnit: WeightUnit) {
  const isWeight = view.unit === "kg" || view.unit === "bodyweight";
  const toDisplay = (v: number) => (isWeight ? toDisplayWeight(v, weightUnit) : v);
  const unitLabel = isWeight ? weightUnit : view.unit === "reps" ? "reps" : "";
  const fmt = (v: number) => {
    if (isWeight) {
      // Tonnage reads better in tonnes.
      if (view.goal?.target.type === "count" && Math.abs(toDisplay(v)) >= 10_000) {
        return `${(toDisplay(v) / 1000).toFixed(1)}k ${weightUnit}`;
      }
      if (view.unit === "bodyweight") return `${toDisplay(v).toFixed(1)} ${weightUnit}`;
      // Estimates and projections to the half: 113.25 kg reads as more precise than it is.
      return `${trimWeight(Math.round(toDisplay(v) * 2) / 2)} ${weightUnit}`;
    }
    const n = Math.round(v * 10) / 10;
    return view.unit === "reps" ? `${n} reps` : `${n}`;
  };
  const fmtRate = (perWeek: number) => {
    const shown = toDisplay(Math.abs(perWeek));
    const n = shown >= 100 ? Math.round(shown) : Math.round(shown * 10) / 10;
    const sign = perWeek > 0 ? "+" : perWeek < 0 ? "−" : "";
    const u = isWeight ? ` ${weightUnit}` : view.unit === "reps" ? " reps" : "";
    return `${sign}${n}${u}/week`;
  };
  return { toDisplay, unitLabel, fmt, fmtRate };
}

const DAY = 24 * 60 * 60 * 1000;

function sameYear(ms: number, nowMs: number) {
  return new Date(ms).getFullYear() === new Date(nowMs).getFullYear();
}

export function fmtDate(ms: number, nowMs = Date.now()): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear(ms, nowMs) ? {} : { year: "numeric" }),
  });
}

function fmtMonth(ms: number, nowMs: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    ...(sameYear(ms, nowMs) ? {} : { year: "numeric" }),
  });
}

/**
 * "around 3 – 17 Mar", "around Mar – May", "around Apr or later". Weeks away → days;
 * further out → months, because a precise date months ahead would be made up.
 */
export function etaText(eta: NonNullable<GoalView["projection"]["eta"]>, nowMs = Date.now()): string {
  const far = eta.likelyMs - nowMs > 10 * 7 * DAY;
  const f = (ms: number) => (far ? fmtMonth(ms, nowMs) : fmtDate(ms, nowMs));
  if (eta.lateMs == null) return `around ${f(eta.likelyMs)} or later`;
  const early = f(eta.earlyMs);
  const late = f(eta.lateMs);
  if (early === late) return `around ${early}`;
  // "Jan – Jun 2027", not "Jan 2027 – Jun 2027": the year once, when both share it.
  const y1 = new Date(eta.earlyMs).getFullYear();
  const y2 = new Date(eta.lateMs).getFullYear();
  if (y1 === y2 && y1 !== new Date(nowMs).getFullYear()) {
    const bare = (ms: number) =>
      new Date(ms).toLocaleDateString(undefined, far ? { month: "short" } : { day: "numeric", month: "short" });
    return `around ${bare(eta.earlyMs)} – ${bare(eta.lateMs)} ${y2}`;
  }
  return `around ${early} – ${late}`;
}

/** One line under the goal: done, on pace for when, or why there's no date. */
export function goalStatusText(view: GoalView, weightUnit: WeightUnit, nowMs = Date.now()): string {
  const p = view.projection;
  const { fmt } = goalFormat(view, weightUnit);
  switch (p.status) {
    case "achieved":
      return view.goal && view.achievedAtMs != null ? `Reached ${fmtDate(view.achievedAtMs, nowMs)}` : "Reached";
    case "ready":
      return view.goal?.target.type === "lift"
        ? "Your estimate is already there. Time to try it."
        : "You're there on the trend. One more good session.";
    case "on_track":
      return `On pace for ${etaText(p.eta!, nowMs)}`;
    case "stalled":
      return p.current != null ? `Not moving toward it lately (${fmt(p.current)} now)` : "Not moving toward it lately";
    case "not_enough_data":
      return view.goal?.target.type === "count" || view.unit === "bodyweight"
        ? "A few more weeks of logs and there'll be a projection"
        : "Log it a few more times for a projection";
  }
}

/** The deadline line, when there's a deadline and something to say. */
export function deadlineText(view: GoalView, weightUnit: WeightUnit, nowMs = Date.now()): string | null {
  if (view.deadlineMs == null || view.projection.status === "achieved") return null;
  const { fmt } = goalFormat(view, weightUnit);
  const by = fmtDate(view.deadlineMs, nowMs);
  if (view.deadlineMs < nowMs) return `Deadline ${by} has passed`;
  const p = view.projection;
  if (p.status === "on_track" && p.eta && p.eta.likelyMs <= view.deadlineMs) return `On track for your ${by} deadline`;
  if (p.atDeadline != null) return `Behind for ${by}: about ${fmt(p.atDeadline)} by then at this pace`;
  return `Deadline ${by}`;
}
