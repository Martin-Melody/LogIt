import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

const g = (n: number) => `${Math.round(n)} g`;

export const todaysNutritionWidget: WidgetPlugin = {
  id: "todays-nutrition",
  name: "Today's Nutrition",
  description: "Calories & macros consumed vs your target.",
  needs: ["nutrition"],

  compute(input: WidgetInput): WidgetView {
    const n = input.nutrition;

    if (!n?.hasGoal || !n.targetKcal) {
      return {
        title: "Today's Nutrition",
        body: [],
        empty: {
          text: "Set a goal for calorie & macro targets.",
          action: { navigate: "/nutrition/goal" },
        },
      };
    }

    const consumedKcal = n.consumedKcal ?? 0;
    const left = Math.round(n.targetKcal - consumedKcal);
    const tm = n.targetMacros;
    const cm = n.consumedMacros ?? { proteinG: 0, carbsG: 0, fatG: 0 };

    const bars: WidgetView["body"][number] = {
      kind: "bar",
      bars: [
        {
          label: "Calories",
          value: consumedKcal,
          max: n.targetKcal,
          sublabel: `${Math.round(consumedKcal)} / ${Math.round(n.targetKcal)} kcal`,
          tone: "primary",
        },
        ...(tm
          ? ([
              { label: "Protein", value: cm.proteinG, max: tm.proteinG, sublabel: `${g(cm.proteinG)} / ${g(tm.proteinG)}`, tone: "protein" as const },
              { label: "Carbs", value: cm.carbsG, max: tm.carbsG, sublabel: `${g(cm.carbsG)} / ${g(tm.carbsG)}`, tone: "carbs" as const },
              { label: "Fat", value: cm.fatG, max: tm.fatG, sublabel: `${g(cm.fatG)} / ${g(tm.fatG)}`, tone: "fat" as const },
            ])
          : []),
      ],
    };

    return {
      title: "Today's Nutrition",
      subtitle:
        left >= 0 ? `${left} kcal left` + (n.sourceLabel ? ` · ${n.sourceLabel}` : "") : `${-left} kcal over`,
      body: [bars],
      headerActions: [{ icon: "add", label: "Log food", action: { navigate: "/nutrition/log" } }],
      action: { navigate: "/nutrition" },
    };
  },
};
