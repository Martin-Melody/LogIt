import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

/**
 * "Mobility" — stretching / mobility momentum: a consecutive-day streak, drills
 * touched this week, and a gauge toward the next round hold-time or rep
 * milestone on the drill you train most. The reference widget for the `gauge`
 * primitive.
 */
export const mobilityWidget: WidgetPlugin = {
  id: "mobility",
  name: "Mobility",
  description: "Stretching streak and progress toward your next milestone.",
  needs: ["mobility"],

  compute(input: WidgetInput): WidgetView {
    const m = input.mobility;
    if (!m || m.drills.length === 0) {
      return {
        title: "Mobility",
        body: [],
        empty: { text: "Log a mobility drill to track it here.", action: { navigate: "/session/current" } },
      };
    }

    // Pick the drill trained most as the gauge focus.
    const focus = [...m.drills].sort((a, b) => b.sessionsLogged - a.sessionsLogged)[0]!;

    const body: WidgetView["body"] = [
      {
        kind: "stat-grid",
        stats: [
          { label: "Streak", value: `${m.streakDays}`, sublabel: m.streakDays === 1 ? "day" : "days" },
          { label: "This week", value: `${m.drillsThisWeek}`, sublabel: m.drillsThisWeek === 1 ? "drill" : "drills" },
        ],
      },
    ];

    if (focus.metric === "hold" && focus.bestHoldSec) {
      const next = nextMilestone(focus.bestHoldSec, [30, 45, 60, 90, 120, 180, 300]);
      body.push({
        kind: "gauge",
        label: focus.name,
        value: focus.bestHoldSec,
        target: next,
        unit: "s",
        sublabel: `${focus.bestHoldSec}s / ${next}s hold`,
      });
    } else if (focus.metric === "reps" && focus.bestReps) {
      const next = nextMilestone(focus.bestReps, [8, 10, 12, 15, 20, 25, 30]);
      body.push({
        kind: "gauge",
        label: focus.name,
        value: focus.bestReps,
        target: next,
        unit: "reps",
        sublabel: `${focus.bestReps} / ${next} reps`,
      });
    }

    return {
      title: "Mobility",
      subtitle: `${m.drills.length} drill${m.drills.length === 1 ? "" : "s"} tracked`,
      body,
      action: { navigate: "/progress" },
    };
  },
};

function nextMilestone(value: number, ladder: number[]): number {
  for (const step of ladder) if (value < step) return step;
  // Past the ladder: round up to the next multiple of the last gap.
  const gap = ladder[ladder.length - 1]! - ladder[ladder.length - 2]!;
  return Math.ceil((value + 1) / gap) * gap;
}
