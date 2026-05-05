import { browser } from "$app/environment";
import { writable, get } from "svelte/store";
import { driver as createDriver, type DriveStep } from "driver.js";

type DriverInstance = ReturnType<typeof createDriver>;
let currentDriver: DriverInstance | null = null;

export function destroyActiveTour() {
  if (currentDriver?.isActive()) {
    currentDriver.destroy();
  }
  currentDriver = null;
}

const STORAGE_KEY = "logit:tours:v1";

type TourState = {
  home: boolean;
  session: boolean;
  splits: boolean;
  splitDetail: boolean;
  splitDay: boolean;
  exercises: boolean;
  profile: boolean;
};

type TourStep = {
  element: string;
  popover: {
    title: string;
    description: string;
    side: "top" | "bottom" | "left" | "right";
    align: "start" | "center" | "end";
  };
};

const defaults: TourState = {
  home: false,
  session: false,
  splits: false,
  splitDetail: false,
  splitDay: false,
  exercises: false,
  profile: false,
};

function load(): TourState {
  if (!browser) return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<TourState>) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

const _store = writable<TourState>(load());
export const tourState = { subscribe: _store.subscribe };

function markSeen(key: keyof TourState) {
  _store.update((s) => {
    const next = { ...s, [key]: true };
    if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export function resetTours() {
  _store.set({ ...defaults });
  if (browser) localStorage.removeItem(STORAGE_KEY);
}

export function startHomeTour(force = false) {
  if (!browser) return;
  if (get(_store).home && !force) return;
  markSeen("home");

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps: [
      {
        element: '[data-tour="quick-start"]',
        popover: {
          title: "Quick Start",
          description:
            "Start today's workout from here. If you have a split set up it loads your planned session automatically — otherwise it starts a blank session.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="todays-plan"]',
        popover: {
          title: "Today's Plan",
          description:
            "Shows the exercises scheduled for today based on your active training split. Tap Edit to jump straight to the split.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="home-customize"]',
        popover: {
          title: "Customise Home",
          description:
            "Rearrange or hide the cards on this page — show only what matters to you.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tour="nav-sessions"]',
        popover: {
          title: "Session History",
          description:
            "Every finished workout is saved here. Tap any session to review your sets, reps, and weights.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="nav-more"]',
        popover: {
          title: "More",
          description:
            "Splits, Progress charts, Exercises, Settings and Plugins all live here — tap More any time to reach them.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="nav-profile"]',
        popover: {
          title: "Profile",
          description:
            "View your personal details and configure how the app suggests progression for your next sessions.",
          side: "top",
          align: "center",
        },
      },
    ],
  });

  currentDriver.drive();
}

export function startSessionTour(force = false) {
  if (!browser) return;
  if (get(_store).session && !force) return;
  markSeen("session");

  const hasExercise = !!document.querySelector('[data-tour="session-exercise-header"]');

  const allSteps = [
    hasExercise && {
      element: '[data-tour="session-exercise-header"]',
      popover: {
        title: "Exercise Card",
        description:
          "Tap the exercise name to rename it. Use + to add more sets, or swipe a row left to edit or delete it.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    hasExercise && {
      element: '[data-tour="session-set-complete"]',
      popover: {
        title: "Complete a Set",
        description:
          "Tap this circle after finishing a set. It marks the set done and starts your rest timer automatically.",
        side: "left" as const,
        align: "center" as const,
      },
    },
    {
      element: '[data-tour="session-add-exercise"]',
      popover: {
        title: "Add Exercise",
        description:
          "Tap + to search your exercise library or add a brand-new one.",
        side: "top" as const,
        align: "end" as const,
      },
    },
    {
      element: '[data-tour="session-finish"]',
      popover: {
        title: "Finish Workout",
        description:
          "Tap here when you're done. Your session is saved and progression targets are recalculated for next time.",
        side: "top" as const,
        align: "center" as const,
      },
    },
  ].filter(Boolean) as DriveStep[];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps: allSteps,
  });

  currentDriver.drive();
}

export function startSplitsTour(force = false) {
  if (!browser) return;
  if (get(_store).splits && !force) return;
  markSeen("splits");

  const hasSetActive = !!document.querySelector('[data-tour="splits-set-active"]');

  const steps = [
    {
      element: '[data-tour="splits-new"]',
      popover: {
        title: "Create a Split",
        description:
          "Tap New to build a training split. Add days (e.g. Push, Pull, Legs) and fill each day with exercises.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
    hasSetActive && {
      element: '[data-tour="splits-set-active"]',
      popover: {
        title: "Set Active",
        description:
          "Only one split is active at a time. The active split is what Quick Start uses on the home screen to load today's plan.",
        side: "left" as const,
        align: "center" as const,
      },
    },
  ].filter(Boolean) as DriveStep[];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  currentDriver.drive();
}

export function startSplitDetailTour(force = false) {
  if (!browser) return;
  if (get(_store).splitDetail && !force) return;
  markSeen("splitDetail");

  const hasSetActive = !!document.querySelector('[data-tour="split-detail-set-active"]');

  const steps = [
    {
      element: '[data-tour="split-detail-name"]',
      popover: {
        title: "Rename Your Split",
        description: "Tap the split name to rename it. Give it something memorable like \"Push / Pull / Legs\".",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    hasSetActive && {
      element: '[data-tour="split-detail-set-active"]',
      popover: {
        title: "Set as Active",
        description: "Make this your current split. Quick Start on the home screen will automatically load today's day from the active split.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
    {
      element: '[data-tour="split-detail-days"]',
      popover: {
        title: "Training Days",
        description: "Each day in your split is a separate workout template — e.g. Push, Pull, Legs. Drag to reorder them.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    {
      element: '[data-tour="split-detail-add-day"]',
      popover: {
        title: "Add a Day",
        description: "Tap here to add a new day to your split. Then tap the day to open it and add exercises.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
  ].filter(Boolean) as DriveStep[];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  currentDriver.drive();
}

export function startSplitDayTour(force = false) {
  if (!browser) return;
  if (get(_store).splitDay && !force) return;
  markSeen("splitDay");

  const steps: DriveStep[] = [
    {
      element: '[data-tour="split-day-name"]',
      popover: {
        title: "Day Name",
        description: "Tap to rename this day — e.g. \"Push\", \"Upper\", or \"Monday\". The name shows up in Quick Start so you always know which session you're doing.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    {
      element: '[data-tour="split-day-add-block"]',
      popover: {
        title: "Add an Exercise",
        description: "Tap + to add an exercise or cardio block to this day. Search your library or type a new name to create one on the spot.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
  ];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  currentDriver.drive();
}

export function startExercisesTour(force = false) {
  if (!browser) return;
  if (get(_store).exercises && !force) return;
  markSeen("exercises");

  const hasList = !!document.querySelector('[data-tour="exercises-list"]');

  const steps = [
    {
      element: '[data-tour="exercises-search"]',
      popover: {
        title: "Search Exercises",
        description: "Type to filter exercises instantly. Works across built-in and your own custom exercises.",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    {
      element: '[data-tour="exercises-filter"]',
      popover: {
        title: "Filter by Type",
        description: "Switch between All exercises, Built-in (core library), or Mine (exercises you've created).",
        side: "bottom" as const,
        align: "start" as const,
      },
    },
    hasList && {
      element: '[data-tour="exercises-list"]',
      popover: {
        title: "Exercise Library",
        description: "Tap any exercise to view or edit it. Built-in exercises can have personal notes added; custom exercises can be fully renamed or deleted.",
        side: "top" as const,
        align: "start" as const,
      },
    },
    {
      element: '[data-tour="exercises-add"]',
      popover: {
        title: "Create an Exercise",
        description: "Tap + to add a custom exercise. Give it a name and optional notes — it'll appear alongside the built-in library everywhere in the app.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
  ].filter(Boolean) as DriveStep[];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  currentDriver.drive();
}

export function startProfileTour(force = false) {
  if (!browser) return;
  if (get(_store).profile && !force) return;
  markSeen("profile");

  const steps: DriveStep[] = [
    {
      element: '[data-tour="profile-avatar"]',
      popover: {
        title: "Your Profile",
        description: "Your avatar shows your initials. Everything here is stored only on your device — nothing is sent anywhere.",
        side: "bottom" as const,
        align: "center" as const,
      },
    },
    {
      element: '[data-tour="profile-edit"]',
      popover: {
        title: "Edit Profile",
        description: "Update your name, bio, height, and body weight here. These are used by widgets on this page.",
        side: "bottom" as const,
        align: "center" as const,
      },
    },
    {
      element: '[data-tour="profile-widgets"]',
      popover: {
        title: "Profile Widgets",
        description: "Widgets show stats at a glance — body measurements, your active training split, and personal records. Tap Customise below to reorder or hide them.",
        side: "top" as const,
        align: "start" as const,
      },
    },
    {
      element: '[data-tour="profile-settings"]',
      popover: {
        title: "Settings",
        description: "Tap the gear to open Settings — configure progression algorithms, rest timers, back up your data, and more.",
        side: "bottom" as const,
        align: "end" as const,
      },
    },
  ];

  currentDriver = createDriver({
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Got it ✓",
    overlayOpacity: 0.6,
    steps,
  });

  currentDriver.drive();
}
