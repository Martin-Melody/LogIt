import type {
  WidgetHeaderAction,
  WidgetInput,
  WidgetPlugin,
  WidgetView,
} from "../widgetView.js";

export const todaysPlanWidget: WidgetPlugin = {
  id: "todays-plan",
  name: "Today's Plan",
  description: "See today's exercises from your active split.",
  needs: ["todaysPlan"],

  compute(input: WidgetInput): WidgetView {
    const plan = input.todaysPlan;
    // Every page is headed by its own day; what's around it goes in notes underneath.
    const { title, subtitle } = plan?.dateIso ? pageHeading(plan, input) : fallbackHeading(plan);
    const notes: WidgetView["body"] = [];
    if (plan?.picked) {
      if (plan.done) notes.push({ kind: "text", text: "Done", tone: "success" });
    } else if (plan) {
      if (plan.done) notes.push({ kind: "text", text: "Done", tone: "success" });
      else if (plan.doneToday?.length) notes.push({ kind: "text", text: `${joinAnd(plan.doneToday)} done today`, tone: "success" });
      if (plan.restToday && !plan.rest) notes.push({ kind: "text", text: "Rest day today", tone: "muted" });
      else if (plan.restBefore?.length) notes.push({ kind: "text", text: restUntil(plan.restBefore, input.timeZone), tone: "muted" });
      if (plan.nextUp) notes.push({ kind: "text", text: `Next: ${relDay(plan.nextUp.dateIso, input)} · ${plan.nextUp.label}`, tone: "muted" });
    }
    const titleIcon = plan?.rest ? ("rest" as const) : undefined;

    const multiDay = (plan?.dayCount ?? 0) > 1;
    const headerActions: WidgetHeaderAction[] = [];
    if (multiDay) {
      headerActions.push(
        { icon: "prev", label: "Previous day", action: { cycleDay: -1 } },
        { icon: "next", label: "Next day", action: { cycleDay: 1 } },
      );
    }
    if (plan?.splitId) {
      headerActions.push({
        icon: "edit",
        label: "Edit split",
        action: { navigate: `/splits/${plan.splitId}` },
      });
    }

    const pager =
      multiDay && plan?.dayIndex != null
        ? { count: plan.dayCount!, index: plan.dayIndex }
        : undefined;

    const swipe = multiDay
      ? ({ left: { cycleDay: 1 }, right: { cycleDay: -1 } } as const)
      : undefined;

    if (plan?.rest) {
      return {
        title,
        subtitle,
        titleIcon,
        headerActions: headerActions.length ? headerActions : undefined,
        pager,
        swipe,
        body: [
          ...(plan.picked ? [] : notes),
          { kind: "text", text: "Nothing planned. Quick start still offers your next workout.", tone: "muted" },
        ],
        action: plan.splitId ? { navigate: `/splits/${plan.splitId}` } : undefined,
      };
    }

    if (!plan || plan.exercises.length === 0) {
      return {
        title,
        subtitle,
        titleIcon,
        headerActions: headerActions.length ? headerActions : undefined,
        pager,
        swipe,
        body: [...notes],
        empty: {
          text: plan ? "No exercises planned for this day." : "Set up a split to see your plan here.",
          action: { navigate: plan?.splitId ? `/splits/${plan.splitId}` : "/splits" },
        },
      };
    }

    return {
      title,
      subtitle,
      titleIcon,
      headerActions: headerActions.length ? headerActions : undefined,
      pager,
      swipe,
      body: [
        ...notes,
        {
          kind: "list",
          items: plan.exercises.slice(0, 8).map((name, i) => ({ label: `${i + 1}. ${name}` })),
        },
        ...(plan.exercises.length > 8
          ? ([{ kind: "text", text: `+${plan.exercises.length - 8} more`, tone: "muted" }] as const)
          : []),
      ],
      action: { navigate: plan.splitId ? `/splits/${plan.splitId}` : "/splits" },
    };
  },
};

function shortDate(iso: string, timeZone?: string): string {
  // Noon UTC so the weekday is right in any zone.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

/** No date to go by (a weekday split with no weekdays set yet): the plain heading. */
function fallbackHeading(plan: WidgetInput["todaysPlan"]): { title: string; subtitle?: string } {
  const parts = [plan?.dayLabel, plan?.scheduled ? "Scheduled" : null].filter(Boolean);
  return { title: "Today's plan", subtitle: parts.join(" · ") || undefined };
}

/** "Rest until then (Sat, Sun)", or without the days when there are many. */
function restUntil(dates: string[], timeZone?: string): string {
  if (dates.length > 3) return "Rest until then";
  const days = dates.map((iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", ...(timeZone ? { timeZone } : {}) }),
  );
  return `Rest until then (${days.join(", ")})`;
}

/** "Upper", "Lower and Mobility", "A, B and C". */
function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

/** YYYY-MM-DD of an instant in a time zone. */
function isoIn(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleDateString("en-CA", timeZone ? { timeZone } : {});
}

/** A page picked with ‹ ›: headed by its day (Today / Tomorrow / "Sun 15 Nov"). */
function pageHeading(plan: NonNullable<WidgetInput["todaysPlan"]>, input: WidgetInput): { title: string; subtitle?: string } {
  const today = isoIn(input.now, input.timeZone);
  const tomorrow = isoIn(input.now + 24 * 60 * 60 * 1000, input.timeZone);
  const subtitle = plan.rest ? "Rest day" : plan.dayLabel;
  const iso = plan.dateIso;
  if (!iso || iso === today) {
    const title = plan.rest || plan.done ? "Today" : plan.doneToday?.length ? "Later today" : "Today's plan";
    const scheduled = !plan.picked && plan.scheduled && title === "Today's plan" && subtitle ? `${subtitle} · Scheduled` : subtitle;
    return { title, subtitle: scheduled };
  }
  if (iso === tomorrow) return { title: "Tomorrow", subtitle };
  return { title: shortDate(iso, input.timeZone), subtitle };
}

/** "Tomorrow" or "Mon 16 Nov". */
function relDay(iso: string, input: WidgetInput): string {
  if (iso === isoIn(input.now + 24 * 60 * 60 * 1000, input.timeZone)) return "Tomorrow";
  return shortDate(iso, input.timeZone);
}
