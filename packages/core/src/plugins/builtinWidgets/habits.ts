import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

/**
 * "Habits" — today's habits with a tap-to-check-off checklist. The reference
 * widget for the `checklist` primitive + the `toggleHabit` action.
 */
export const habitsWidget: WidgetPlugin = {
  id: "habits",
  name: "Habits",
  description: "Today's habits — tap to check one off.",
  needs: ["habits"],

  compute(input: WidgetInput): WidgetView {
    const habits = input.habits ?? [];

    if (habits.length === 0) {
      return {
        title: "Habits",
        body: [],
        empty: { text: "Add a habit to track it here.", action: { navigate: "/habits" } },
      };
    }

    const dueToday = habits.filter((h) => h.dueToday);
    const doneCount = dueToday.filter((h) => h.doneToday).length;

    return {
      title: "Habits",
      subtitle: dueToday.length
        ? `${doneCount} / ${dueToday.length} done today`
        : "Nothing due today",
      body: [
        {
          kind: "checklist",
          items: habits.map((h) => ({
            id: h.id,
            label: h.name,
            checked: h.doneToday,
            muted: !h.dueToday,
            sublabel: h.weekProgress
              ? `${h.weekProgress.done} / ${h.weekProgress.target} this week`
              : h.streak > 0
                ? `${h.streak} day${h.streak === 1 ? "" : "s"} streak`
                : undefined,
            action: { toggleHabit: h.id },
          })),
        },
      ],
      action: { navigate: "/habits" },
    };
  },
};
