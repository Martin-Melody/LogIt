import type { WidgetDefinition, WidgetId } from "./widget";
import type { WidgetRegistry } from "./widgetRegistry";

import QuickStartWidget from "./components/QuickStartWidget.svelte";
import TodaysPlanWidget from "./components/TodaysPlanWidget.svelte";
import LastSessionWidget from "./components/LastSessionWidget.svelte";
import ProgressionWidget from "./components/ProgressionWidget.svelte";
import ActivityTrackerWidget from "./components/ActivityTrackerWidget.svelte";
import MuscleMapWidget from "./components/MuscleMapWidget.svelte";

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
  {
    id: "last-session",
    label: "Recent Sessions",
    description: "Jump back into a recent session.",
    component: LastSessionWidget,
    defaultEnabled: true,
    defaultOrder: 2,
  },
  {
    id: "progression",
    label: "Progression",
    description: "Current targets for your tracked exercises.",
    component: ProgressionWidget,
    defaultEnabled: true,
    defaultOrder: 3,
  },
  {
    id: "activity-tracker",
    label: "Activity Tracker",
    description: "Monthly workout calendar. Tap for a full year view.",
    component: ActivityTrackerWidget,
    defaultEnabled: true,
    defaultOrder: 4,
  },
  {
    id: "muscle-map",
    label: "Muscle Focus",
    description: "Body map showing which muscles you've trained this week.",
    component: MuscleMapWidget,
    defaultEnabled: true,
    defaultOrder: 5,
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
