import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

export const progressionWidget: WidgetPlugin = {
  id: "progression",
  name: "Progression",
  description: "Current targets for your tracked exercises.",
  needs: ["progressionTargets"],

  compute(input: WidgetInput): WidgetView {
    const rows = (input.progressionTargets ?? []).slice(0, 4);

    if (rows.length === 0) {
      return {
        title: "Progression",
        body: [],
        empty: {
          // An algorithm is always set (LogIt Adaptive by default): only a workout is missing (bug hunt 4.11).
          text: "Your next weights show here after your first workout.",
          action: { navigate: "/settings/progression" },
        },
      };
    }

    return {
      title: "Progression",
      body: [
        {
          kind: "list",
          items: rows.map((r) => ({ label: r.exerciseName, trailing: r.target })),
        },
      ],
      action: { navigate: "/progress" },
    };
  },
};
