import type { WidgetDefinition, WidgetId } from "$lib/features/widgets/widget";
import type { WidgetRegistry } from "$lib/features/widgets/widgetRegistry";

import BodyStatsWidget from "./components/BodyStatsWidget.svelte";
import ActiveSplitWidget from "./components/ActiveSplitWidget.svelte";
import PersonalRecordsWidget from "./components/PersonalRecordsWidget.svelte";

const BUNDLED: WidgetDefinition[] = [
  {
    id: "profile-body-stats",
    label: "Body Stats",
    description: "Your height and weight.",
    component: BodyStatsWidget,
    defaultEnabled: true,
    defaultOrder: 0,
  },
  {
    id: "profile-active-split",
    label: "Active Split",
    description: "Your current training split.",
    component: ActiveSplitWidget,
    defaultEnabled: true,
    defaultOrder: 1,
  },
  {
    id: "profile-personal-records",
    label: "Personal Records",
    description: "Your heaviest recorded sets per exercise.",
    component: PersonalRecordsWidget,
    defaultEnabled: true,
    defaultOrder: 2,
  },
];

class LocalProfileWidgetRegistry implements WidgetRegistry {
  list(): WidgetDefinition[] {
    return BUNDLED;
  }

  get(id: WidgetId): WidgetDefinition | null {
    return BUNDLED.find((w) => w.id === id) ?? null;
  }
}

export const localProfileWidgetRegistry = new LocalProfileWidgetRegistry();
