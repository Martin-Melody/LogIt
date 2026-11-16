/**
 * The Overview's widgets: which ones, in what order, at what size. Saved per account in this
 * browser for now; syncing it to the phone ("use this layout on my phone too") comes with
 * the devices work, which adds a field for it on the server.
 */

export type WidgetSize = "s" | "m" | "l" | "xl";
/** A widget plugin installed on the account: "plugin:<manifest id>". */
export type PluginWidgetId = `plugin:${string}`;
/** A saved Insights chart ticked "Overview": "chart:<chart id>". */
export type ChartWidgetId = `chart:${string}`;
export type WidgetId = BuiltinWidgetId | PluginWidgetId | ChartWidgetId;
export type BuiltinWidgetId =
  | "streak"
  | "sessions-week"
  | "volume-week"
  | "body-weight"
  | "this-week"
  | "goals"
  | "weekly-volume"
  | "records"
  | "recent-sessions"
  | "habits";

export type WidgetDef = { id: WidgetId; title: string; description: string; defaultSize: WidgetSize; sizes: WidgetSize[] };

export const WIDGETS: WidgetDef[] = [
  { id: "streak", title: "Streak", description: "Weeks in a row you hit your target", defaultSize: "s", sizes: ["s", "m"] },
  { id: "sessions-week", title: "Sessions this week", description: "Workouts against your weekly target", defaultSize: "s", sizes: ["s", "m"] },
  { id: "volume-week", title: "Volume this week", description: "Tonnes lifted, against last week", defaultSize: "s", sizes: ["s", "m"] },
  { id: "body-weight", title: "Body weight", description: "Smoothed trend and weekly change", defaultSize: "s", sizes: ["s", "m"] },
  { id: "this-week", title: "This week", description: "Your split's days: done, today and coming up", defaultSize: "l", sizes: ["m", "l", "xl"] },
  { id: "goals", title: "Goals", description: "Progress and when you'll get there", defaultSize: "s", sizes: ["s", "m", "l"] },
  { id: "weekly-volume", title: "Weekly volume", description: "The last 12 weeks", defaultSize: "l", sizes: ["m", "l", "xl"] },
  { id: "records", title: "Recent records", description: "Your latest PRs, with dates", defaultSize: "s", sizes: ["s", "m"] },
  { id: "recent-sessions", title: "Recent sessions", description: "Your last few workouts", defaultSize: "l", sizes: ["m", "l", "xl"] },
  { id: "habits", title: "Habits this week", description: "Ticks for each day", defaultSize: "s", sizes: ["s", "m"] },
];

export type Slot = { id: WidgetId; size: WidgetSize };

const DEFAULT_LAYOUT: Slot[] = WIDGETS.map((w) => ({ id: w.id, size: w.defaultSize }));

function key(userId: string): string {
  return `logit-web:overview-layout:v1:${userId}`;
}

export const PLUGIN_SIZES: WidgetSize[] = ["s", "m", "l"];

export function isPluginWidget(id: WidgetId): id is PluginWidgetId {
  return id.startsWith("plugin:");
}

export function isChartWidget(id: WidgetId): id is ChartWidgetId {
  return id.startsWith("chart:");
}

export const CHART_SIZES: WidgetSize[] = ["m", "l", "xl"];

function read(userId: string): Slot[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return DEFAULT_LAYOUT;
    const known = new Map(WIDGETS.map((w) => [w.id, w]));
    // Plugin widgets stay in the layout even while the plugin is off or not synced yet;
    // the page just doesn't show them until it's back.
    const slots = (JSON.parse(raw) as Slot[]).filter((s) => known.has(s.id) || isPluginWidget(s.id) || isChartWidget(s.id));
    return slots.map((s) => {
      const def = known.get(s.id);
      const sizes = def?.sizes ?? (isChartWidget(s.id) ? CHART_SIZES : PLUGIN_SIZES);
      return { id: s.id, size: sizes.includes(s.size) ? s.size : (def?.defaultSize ?? "m") };
    });
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function createLayout(userId: string) {
  let slots = $state<Slot[]>(read(userId));
  /** Widget plugins installed and switched on, which can go on the Overview. */
  let extra = $state<WidgetDef[]>([]);

  function save() {
    try { localStorage.setItem(key(userId), JSON.stringify(slots)); } catch {}
  }

  return {
    get slots() { return slots; },
    get hidden() { return [...WIDGETS, ...extra].filter((w) => !slots.some((s) => s.id === w.id)); },
    get extra() { return extra; },
    setExtra(defs: WidgetDef[]) { extra = defs; },
    move(id: WidgetId, by: -1 | 1) {
      const i = slots.findIndex((s) => s.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= slots.length) return;
      const next = [...slots];
      [next[i], next[j]] = [next[j]!, next[i]!];
      slots = next;
      save();
    },
    /** Drag and drop: the widgets in this order (any left out keep their place at the end). */
    setOrder(ids: WidgetId[]) {
      const byId = new Map(slots.map((s) => [s.id, s]));
      const next = ids.map((id) => byId.get(id)).filter((s): s is Slot => s !== undefined);
      slots = [...next, ...slots.filter((s) => !ids.includes(s.id))];
      save();
    },
    resize(id: WidgetId, size: WidgetSize) {
      slots = slots.map((s) => (s.id === id ? { ...s, size } : s));
      save();
    },
    remove(id: WidgetId) {
      slots = slots.filter((s) => s.id !== id);
      save();
    },
    add(id: WidgetId) {
      const def = [...WIDGETS, ...extra].find((w) => w.id === id);
      // A chart can be added before its definition arrives (it comes with the charts' data).
      if ((!def && !isChartWidget(id)) || slots.some((s) => s.id === id)) return;
      slots = [...slots, { id, size: def?.defaultSize ?? "l" }];
      save();
    },
    reset() {
      slots = DEFAULT_LAYOUT;
      save();
    },
  };
}

/** Grid spans: 1 column on phones, 2 on tablets, 4 on wide screens. */
export const SPAN: Record<WidgetSize, string> = {
  s: "",
  m: "md:col-span-2",
  l: "md:col-span-2 xl:col-span-3",
  xl: "md:col-span-2 xl:col-span-4",
};

export const SIZE_LABEL: Record<WidgetSize, string> = { s: "S", m: "M", l: "L", xl: "Full" };
