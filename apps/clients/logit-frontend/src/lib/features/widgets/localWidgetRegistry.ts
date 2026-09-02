import type { WidgetDefinition, WidgetId } from "./widget";
import type { WidgetRegistry } from "./widgetRegistry";

import QuickStartWidget from "./components/QuickStartWidget.svelte";
import TodaysPlanWidget from "./components/TodaysPlanWidget.svelte";
import WidgetCard from "./render/WidgetCard.svelte";
import { muscleFocusWidget } from "@logit/core/plugins/builtinWidgets/muscleFocus";
import { recentSessionsWidget } from "@logit/core/plugins/builtinWidgets/recentSessions";
import { activityWidget } from "@logit/core/plugins/builtinWidgets/activity";
import { progressionWidget } from "@logit/core/plugins/builtinWidgets/progression";
import { todaysNutritionWidget } from "@logit/core/plugins/builtinWidgets/todaysNutrition";
import { weightTrendWidget } from "@logit/core/plugins/builtinWidgets/weightTrend";

const BUNDLED: WidgetDefinition[] = [
  {
    id: "quick-start",
    label: "Quick Start",
    description: "Start or continue a workout.",
    component: QuickStartWidget,
    defaultEnabled: true,
    defaultOrder: 0,
  },
  {
    id: "todays-plan",
    label: "Today's Plan",
    description: "See today's exercises from your active split.",
    component: TodaysPlanWidget,
    defaultEnabled: true,
    defaultOrder: 1,
  },
  // WidgetView model — a compute() returning a declarative view the host
  // renders. See @logit/core/plugins/widgetView. Community widgets use the same
  // WidgetCard, with a sandboxed plugin.
  {
    id: "last-session",
    label: "Recent Sessions",
    description: "Jump back into a recent session.",
    component: WidgetCard,
    props: { plugin: recentSessionsWidget },
    defaultEnabled: true,
    defaultOrder: 2,
  },
  {
    id: "progression",
    label: "Progression",
    description: "Current targets for your tracked exercises.",
    component: WidgetCard,
    props: { plugin: progressionWidget },
    defaultEnabled: true,
    defaultOrder: 3,
  },
  {
    id: "activity-tracker",
    label: "Activity Tracker",
    description: "Monthly workout calendar. Tap for a full year view.",
    component: WidgetCard,
    props: { plugin: activityWidget },
    defaultEnabled: true,
    defaultOrder: 4,
  },
  {
    id: "muscle-map",
    label: "Muscle Focus",
    description: "Body map showing which muscles you've trained this week.",
    component: WidgetCard,
    props: { plugin: muscleFocusWidget },
    defaultEnabled: true,
    defaultOrder: 5,
  },
  {
    id: "todays-nutrition",
    label: "Today's Nutrition",
    description: "Calories & macros consumed vs your target. Auto-added once you set a nutrition goal.",
    component: WidgetCard,
    props: { plugin: todaysNutritionWidget },
    defaultEnabled: false,
    defaultOrder: 6,
  },
  {
    id: "weight-trend",
    label: "Weight Trend",
    description: "Smoothed bodyweight trend and weekly rate. Auto-added once you set a nutrition goal.",
    component: WidgetCard,
    props: { plugin: weightTrendWidget },
    defaultEnabled: false,
    defaultOrder: 7,
  },
];

export class LocalWidgetRegistry implements WidgetRegistry {
  list(): WidgetDefinition[] {
    return BUNDLED;
  }

  get(id: WidgetId): WidgetDefinition | null {
    return BUNDLED.find((w) => w.id === id) ?? null;
  }
}

export const localWidgetRegistry = new LocalWidgetRegistry();
