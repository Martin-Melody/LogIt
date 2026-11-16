import type { WidgetDataNeed } from "./widgetView";

/**
 * Plain-words facts about plugins that the phone and the dashboard both show: what each type
 * is called, what data a plugin gets, and what it can do. A plugin only ever gets what's
 * listed here — the host passes nothing else into the sandbox.
 */

export const PLUGIN_FAMILIES = [
  "widget",
  "progression-algorithm",
  "mobility-progression",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack",
  "mobility-pack",
] as const;
export type BuildablePluginFamily = (typeof PLUGIN_FAMILIES)[number];

export const CODE_FAMILIES: ReadonlySet<string> = new Set([
  "widget",
  "progression-algorithm",
  "mobility-progression",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
]);

export function isCodeFamily(family: string): boolean {
  return CODE_FAMILIES.has(family);
}

export const FAMILY_LABELS: Record<string, string> = {
  widget: "Widget",
  "progression-algorithm": "Progression",
  "mobility-progression": "Mobility progression",
  analytics: "Analytics",
  "nutrition-algorithm": "Nutrition targets",
  "nutrition-analytics": "Nutrition analytics",
  "exercise-pack": "Exercise pack",
  "mobility-pack": "Mobility pack",
  "muscle-group-insight": "Muscle insight",
};

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

/** The export a bundle of this family names in `entryExport`, and the method it must have. */
export const FAMILY_ENTRY: Record<string, { entry: string; method: string }> = {
  widget: { entry: "widget", method: "compute" },
  "progression-algorithm": { entry: "algorithm", method: "suggest" },
  "mobility-progression": { entry: "algorithm", method: "suggest" },
  analytics: { entry: "analytics", method: "compute" },
  "nutrition-algorithm": { entry: "algorithm", method: "computeTargets" },
  "nutrition-analytics": { entry: "analytics", method: "compute" },
};

export type GetsLine = { label: string; detail: string };

/** What a widget can ask for, in the order the builder lists them. */
export const WIDGET_NEEDS: { need: WidgetDataNeed; label: string; detail: string }[] = [
  { need: "workouts", label: "Recent workouts", detail: "Sessions from about the last 200 days, with sets" },
  { need: "exercises", label: "Exercise list", detail: "Your exercises and the muscles they work" },
  { need: "session", label: "The session you're in", detail: "Whether a workout is running, and today's planned day" },
  { need: "todaysPlan", label: "Today's plan", detail: "The split day planned for today and its exercises" },
  { need: "progressionTargets", label: "Progression targets", detail: "The next target for each exercise you track" },
  { need: "nutrition", label: "Nutrition", detail: "Today's calories and macros against your targets" },
  { need: "bodyweight", label: "Body weight", detail: "Your current weight, trend and goal" },
  { need: "habits", label: "Habits", detail: "Your habits, whether they're done today, and streaks" },
  { need: "mobility", label: "Mobility", detail: "Drills you've logged, with best holds and reps" },
];

const NEED_INDEX = new Map(WIDGET_NEEDS.map((n) => [n.need as string, n]));

export function isWidgetNeed(need: string): need is WidgetDataNeed {
  return NEED_INDEX.has(need);
}

/** Short, lower-case summary for cards: "your recent workouts, habits". */
export function getsSummary(family: string, needs: readonly string[] | undefined): string {
  if (!isCodeFamily(family)) return "Data only, runs no code";
  return pluginGets(family, needs)
    .map((g) => g.label.charAt(0).toLowerCase() + g.label.slice(1))
    .join(", ");
}

/** Everything a plugin of this type gets, for the install sheet and the plugin page. */
export function pluginGets(family: string, needs: readonly string[] | undefined): GetsLine[] {
  switch (family) {
    case "widget": {
      const lines = (needs ?? []).flatMap((n) => {
        const info = NEED_INDEX.get(n);
        return info ? [{ label: info.label, detail: info.detail }] : [];
      });
      return lines.length > 0 ? lines : [{ label: "Nothing", detail: "Only the date and your weight unit" }];
    }
    case "progression-algorithm":
      return [{ label: "That exercise's history", detail: "Your past sets for the exercise it's set on, and its own saved state" }];
    case "mobility-progression":
      return [{ label: "That drill's history", detail: "Your past holds or reps for the drill it's set on" }];
    case "analytics":
      return [{ label: "That exercise's history", detail: "All your sets for the exercise you're looking at, and your mobility log" }];
    case "nutrition-algorithm":
      return [
        { label: "Nutrition goal", detail: "Your goal, body weight log and daily calories" },
      ];
    case "nutrition-analytics":
      return [{ label: "Food diary", detail: "Diary days in the range you pick, your weight log, goal and targets" }];
    default:
      return [];
  }
}

/** What a plugin of this type can do. */
export function pluginCan(family: string): string[] {
  switch (family) {
    case "widget":
      return ["Show a card on your home screen and Overview", "Open a LogIt page, start a workout or tick a habit when you tap it"];
    case "progression-algorithm":
    case "mobility-progression":
      return ["Suggest your next sets"];
    case "analytics":
    case "nutrition-analytics":
      return ["Show charts and notes"];
    case "nutrition-algorithm":
      return ["Set your daily calorie and macro targets"];
    case "exercise-pack":
      return ["Add exercises to your library"];
    case "mobility-pack":
      return ["Add mobility drills to your library"];
    default:
      return [];
  }
}

/** The "needs" array literal in a bundle's source, or null when there isn't exactly one. */
const NEEDS_LITERAL = /needs\s*:\s*\[([^\]]*)\]/g;

export function readNeedsFromSource(source: string): string[] | null {
  const matches = [...source.matchAll(NEEDS_LITERAL)];
  if (matches.length !== 1) return null;
  return [...matches[0]![1]!.matchAll(/["'`]([A-Za-z]+)["'`]/g)].map((m) => m[1]!);
}

/** Rewrite the one `needs: [...]` literal; returns null when there isn't exactly one. */
export function writeNeedsToSource(source: string, needs: readonly string[]): string | null {
  const matches = [...source.matchAll(NEEDS_LITERAL)];
  if (matches.length !== 1) return null;
  const ordered = WIDGET_NEEDS.map((n) => n.need as string).filter((n) => needs.includes(n));
  const literal = `needs: [${ordered.map((n) => `"${n}"`).join(", ")}]`;
  return source.replace(NEEDS_LITERAL, literal);
}
