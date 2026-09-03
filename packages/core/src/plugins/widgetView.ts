import type { MuscleGroup } from "../domain/exercise";

/**
 * A home-screen widget is a pure function `compute(input) => WidgetView`. It
 * describes *what* to show using a fixed vocabulary the host renders — never
 * markup, never a component. Built-in and community widgets run through the
 * exact same path; community ones run in the interpreter sandbox.
 *
 * Adding a primitive is a deliberate host change (a new renderer). The tradeoff
 * — a plugin can only compose what the host ships — is the same one Apple
 * WidgetKit and Android Glance make.
 */

// ── Input ────────────────────────────────────────────────────────────────────

/** Data slices a widget can ask for; the host loads only what's declared. */
export type WidgetDataNeed =
  | "workouts"
  | "exercises"
  | "session"
  | "todaysPlan"
  | "progressionTargets"
  | "nutrition"
  | "bodyweight"
  | "habits";

export type WidgetWorkoutSet = {
  weight: number;
  reps: number;
  type?: string;
};

export type WidgetWorkoutExercise = {
  exerciseId?: string;
  name: string;
  sets: WidgetWorkoutSet[];
};

export type WidgetWorkout = {
  id: string;
  startedAtMs: number;
  endedAtMs?: number;
  exercises: WidgetWorkoutExercise[];
};

export type WidgetExercise = {
  id: string;
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
};

export type WidgetInput = {
  now: number;
  /** IANA timezone of the user, for day-boundary maths. */
  timeZone?: string;
  prefs: {
    weightUnit: "kg" | "lbs";
  };
  workouts?: WidgetWorkout[];
  exercises?: WidgetExercise[];
  /** Whether a workout is currently in progress + today's planned day, if any. */
  session?: {
    active: boolean;
    hasPlan: boolean;
    plannedDayLabel?: string;
  };
  todaysPlan?: {
    splitId?: string;
    dayLabel?: string;
    scheduled: boolean;
    /** 0-based position of the shown day, and how many days the split has. */
    dayIndex?: number;
    dayCount?: number;
    exercises: string[];
  };
  /** Current targets per tracked exercise — the host runs the algorithm. */
  progressionTargets?: { exerciseName: string; target: string }[];
  nutrition?: {
    hasGoal: boolean;
    sourceLabel?: string;
    targetKcal?: number;
    consumedKcal?: number;
    targetMacros?: { proteinG: number; carbsG: number; fatG: number };
    consumedMacros?: { proteinG: number; carbsG: number; fatG: number };
  };
  bodyweight?: {
    currentKg?: number;
    weeklyRateKg?: number;
    targetKg?: number;
    trendPoints: { dateIso: string; kg: number }[];
  };
  habits?: {
    id: string;
    name: string;
    icon?: string;
    dueToday: boolean;
    doneToday: boolean;
    streak: number;
    /** "2 / 3 this week" for weekly-cadence habits. */
    weekProgress?: { done: number; target: number };
  }[];
};

// ── View ─────────────────────────────────────────────────────────────────────

/** An action a widget node can trigger — validated against a host allow-list. */
export type WidgetAction =
  | { navigate: string }
  | { startEmptyWorkout: true }
  | { startPlannedWorkout: true }
  | { resumeWorkout: true }
  /** Move the previewed split day (Today's Plan). -1 = previous, 1 = next. */
  | { cycleDay: -1 | 1 }
  /** Toggle today's check-off for a habit (id must be a real habit). */
  | { toggleHabit: string };

export type WidgetTextNode = {
  kind: "text";
  text: string;
  tone?: "default" | "muted" | "primary";
};

export type WidgetStat = {
  label: string;
  value: string;
  sublabel?: string;
};

export type WidgetStatGridNode = {
  kind: "stat-grid";
  stats: WidgetStat[];
};

export type WidgetListItem = {
  label: string;
  sublabel?: string;
  trailing?: string;
  action?: WidgetAction;
};

export type WidgetListNode = {
  kind: "list";
  items: WidgetListItem[];
  emptyText?: string;
};

export type WidgetProgressRing = {
  label: string;
  value: number;
  max: number;
  unit?: string;
};

export type WidgetProgressRingsNode = {
  kind: "progress-rings";
  rings: WidgetProgressRing[];
};

export type WidgetBarTone = "primary" | "protein" | "carbs" | "fat";

export type WidgetBarNode = {
  kind: "bar";
  bars: {
    label: string;
    value: number;
    max?: number;
    /** e.g. "120 / 150 g" */
    sublabel?: string;
    tone?: WidgetBarTone;
  }[];
};

export type WidgetCalendarHeatmapNode = {
  kind: "calendar-heatmap";
  /** "YYYY-MM" — the month to render. */
  month: string;
  /** One entry per day that has activity; value drives the shade. */
  days: { day: number; value: number; action?: WidgetAction }[];
};

export type WidgetLineNode = {
  kind: "line";
  points: { x: number; y: number }[];
  /** Optional horizontal reference line, e.g. a goal weight. */
  reference?: number;
};

export type WidgetMuscleMapNode = {
  kind: "muscle-map";
  /** Effort per muscle group — the host buckets these into intensity bands. */
  values: Partial<Record<MuscleGroup, number>>;
  /** Band thresholds, ascending, e.g. [1, 5, 12]. */
  scale?: [number, number, number];
  caption?: string;
};

export type WidgetButtonRowNode = {
  kind: "button-row";
  buttons: { label: string; action: WidgetAction; primary?: boolean }[];
};

export type WidgetChecklistNode = {
  kind: "checklist";
  items: {
    id: string;
    label: string;
    checked: boolean;
    sublabel?: string;
    /** Tapping the row runs this — e.g. `{ toggleHabit: id }`. */
    action?: WidgetAction;
    /** Dim the row (e.g. a habit not due today). */
    muted?: boolean;
  }[];
};

export type WidgetNode =
  | WidgetTextNode
  | WidgetStatGridNode
  | WidgetListNode
  | WidgetProgressRingsNode
  | WidgetBarNode
  | WidgetLineNode
  | WidgetMuscleMapNode
  | WidgetCalendarHeatmapNode
  | WidgetButtonRowNode
  | WidgetChecklistNode;

export type WidgetHeaderAction = {
  /** Which glyph the host draws. */
  icon: "add" | "edit" | "prev" | "next";
  label: string;
  action: WidgetAction;
};

export type WidgetView = {
  title: string;
  subtitle?: string;
  /** One or more primitive nodes, stacked. */
  body: WidgetNode[];
  /** Tapping the card body (outside interactive nodes) goes here. */
  action?: WidgetAction;
  /** Icon-buttons in the card header, e.g. prev/next day, "log food". */
  headerActions?: WidgetHeaderAction[];
  /** Dot pager under the header, e.g. which split day is shown. */
  pager?: { count: number; index: number };
  /** Horizontal swipe on the card triggers these (e.g. cycle split days). */
  swipe?: { left: WidgetAction; right: WidgetAction };
  /** Shown instead of body when the widget has nothing yet. */
  empty?: { text: string; action?: WidgetAction };
};

export type WidgetPlugin = {
  id: string;
  name: string;
  description: string;
  needs: WidgetDataNeed[];
  compute(input: WidgetInput): WidgetView | Promise<WidgetView>;
};
