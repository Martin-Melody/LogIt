import type { WidgetDefinition, WidgetId } from "$lib/features/widgets/widget";
import type { WidgetRegistry } from "$lib/features/widgets/widgetRegistry";

import BodyStatsWidget from "./components/BodyStatsWidget.svelte";
import ActiveSplitWidget from "./components/ActiveSplitWidget.svelte";
import PersonalRecordsWidget from "./components/PersonalRecordsWidget.svelte";
import CurrentPhotoWidget from "./components/CurrentPhotoWidget.svelte";
import WeightTrendWidget from "./components/WeightTrendWidget.svelte";
import StreakWidget from "./components/StreakWidget.svelte";
import MilestoneBadgesWidget from "./components/MilestoneBadgesWidget.svelte";

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
  {
    id: "profile-progress-photo",
    label: "Progress Photo",
    description: "A current photo to track visible progress.",
    component: CurrentPhotoWidget,
    defaultEnabled: false,
    defaultOrder: 3,
  },
  {
    id: "profile-weight-trend",
    label: "Weight Trend",
    description: "A smoothed chart of your logged bodyweight.",
    component: WeightTrendWidget,
    defaultEnabled: false,
    defaultOrder: 4,
  },
  {
    id: "profile-streak",
    label: "Training Streak",
    description: "Your current and best consecutive-day training streak.",
    component: StreakWidget,
    defaultEnabled: false,
    defaultOrder: 5,
  },
  {
    id: "profile-milestones",
    label: "Milestones",
    description: "Badges for streaks, PR counts, and consistency.",
    component: MilestoneBadgesWidget,
    defaultEnabled: false,
    defaultOrder: 6,
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
