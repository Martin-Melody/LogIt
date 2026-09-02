import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

export const todaysPlanWidget: WidgetPlugin = {
  id: "todays-plan",
  name: "Today's Plan",
  description: "See today's exercises from your active split.",
  needs: ["todaysPlan"],

  compute(input: WidgetInput): WidgetView {
    const plan = input.todaysPlan;

    if (!plan || plan.exercises.length === 0) {
      return {
        title: "Today's plan",
        body: [],
        empty: {
          text: plan ? "No exercises planned for this day." : "Set up a split to see your plan here.",
          action: { navigate: "/splits" },
        },
      };
    }

    return {
      title: "Today's plan",
      subtitle: [plan.dayLabel, plan.scheduled ? "Scheduled" : null].filter(Boolean).join(" · ") || undefined,
      body: [
        {
          kind: "list",
          items: plan.exercises.slice(0, 8).map((name, i) => ({ label: `${i + 1}. ${name}` })),
        },
        ...(plan.exercises.length > 8
          ? ([{ kind: "text", text: `+${plan.exercises.length - 8} more`, tone: "muted" }] as const)
          : []),
      ],
      action: { navigate: "/splits" },
    };
  },
};
