import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

export const quickStartWidget: WidgetPlugin = {
  id: "quick-start",
  name: "Quick Start",
  description: "Start or continue a workout.",
  needs: ["session"],

  compute(input: WidgetInput): WidgetView {
    const s = input.session ?? { active: false, hasPlan: false };

    if (s.active) {
      return {
        title: "Workout in progress",
        body: [
          {
            kind: "button-row",
            buttons: [
              { label: "Continue workout", action: { resumeWorkout: true }, primary: true },
              { label: "Start new", action: { startEmptyWorkout: true } },
            ],
          },
        ],
      };
    }

    if (s.hasPlan) {
      return {
        title: "Quick start",
        body: [
          {
            kind: "button-row",
            buttons: [
              {
                label: s.plannedDayLabel ? `Start ${s.plannedDayLabel}` : "Start today's plan",
                action: { startPlannedWorkout: true },
                primary: true,
              },
              { label: "Start unplanned", action: { startEmptyWorkout: true } },
            ],
          },
        ],
      };
    }

    return {
      title: "Quick start",
      body: [
        {
          kind: "button-row",
          buttons: [{ label: "Start workout", action: { startEmptyWorkout: true }, primary: true }],
        },
      ],
    };
  },
};
