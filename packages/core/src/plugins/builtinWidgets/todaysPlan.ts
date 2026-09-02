import type {
  WidgetHeaderAction,
  WidgetInput,
  WidgetPlugin,
  WidgetView,
} from "../widgetView.js";

export const todaysPlanWidget: WidgetPlugin = {
  id: "todays-plan",
  name: "Today's Plan",
  description: "See today's exercises from your active split.",
  needs: ["todaysPlan"],

  compute(input: WidgetInput): WidgetView {
    const plan = input.todaysPlan;
    const subtitle =
      [plan?.dayLabel, plan?.scheduled ? "Scheduled" : null].filter(Boolean).join(" · ") ||
      undefined;

    const multiDay = (plan?.dayCount ?? 0) > 1;
    const headerActions: WidgetHeaderAction[] = [];
    if (multiDay) {
      headerActions.push(
        { icon: "prev", label: "Previous day", action: { cycleDay: -1 } },
        { icon: "next", label: "Next day", action: { cycleDay: 1 } },
      );
    }
    if (plan?.splitId) {
      headerActions.push({
        icon: "edit",
        label: "Edit split",
        action: { navigate: `/splits/${plan.splitId}` },
      });
    }

    const pager =
      multiDay && plan?.dayIndex != null
        ? { count: plan.dayCount!, index: plan.dayIndex }
        : undefined;

    if (!plan || plan.exercises.length === 0) {
      return {
        title: "Today's plan",
        subtitle,
        headerActions: headerActions.length ? headerActions : undefined,
        pager,
        body: [],
        empty: {
          text: plan ? "No exercises planned for this day." : "Set up a split to see your plan here.",
          action: { navigate: plan?.splitId ? `/splits/${plan.splitId}` : "/splits" },
        },
      };
    }

    return {
      title: "Today's plan",
      subtitle,
      headerActions: headerActions.length ? headerActions : undefined,
      pager,
      body: [
        {
          kind: "list",
          items: plan.exercises.slice(0, 8).map((name, i) => ({ label: `${i + 1}. ${name}` })),
        },
        ...(plan.exercises.length > 8
          ? ([{ kind: "text", text: `+${plan.exercises.length - 8} more`, tone: "muted" }] as const)
          : []),
      ],
      action: { navigate: plan.splitId ? `/splits/${plan.splitId}` : "/splits" },
    };
  },
};
