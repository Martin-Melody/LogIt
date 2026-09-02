import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

export const activityWidget: WidgetPlugin = {
  id: "activity-tracker",
  name: "Activity",
  description: "Monthly workout calendar.",
  needs: ["workouts"],

  compute(input: WidgetInput): WidgetView {
    const now = new Date(input.now);
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

    const byDay = new Map<number, string>();
    for (const w of input.workouts ?? []) {
      if (!w.endedAtMs) continue;
      const d = new Date(w.endedAtMs);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      if (!byDay.has(d.getDate())) byDay.set(d.getDate(), w.id);
    }

    const subtitle = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (byDay.size === 0) {
      return {
        title: "Activity",
        subtitle,
        body: [],
        empty: { text: "No workouts logged this month yet.", action: { startEmptyWorkout: true } },
      };
    }

    return {
      title: "Activity",
      subtitle,
      body: [
        {
          kind: "calendar-heatmap",
          month: monthStr,
          days: [...byDay.entries()].map(([day, id]) => ({
            day,
            value: 1,
            action: { navigate: `/sessions/${id}` },
          })),
        },
      ],
      action: { navigate: "/activity" },
    };
  },
};
