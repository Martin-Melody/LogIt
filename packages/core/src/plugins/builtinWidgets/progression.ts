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
          text: "Finish a session and pick an algorithm in Settings to see targets here.",
          action: { navigate: "/settings" },
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
