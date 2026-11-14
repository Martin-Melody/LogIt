/**
 * The Overview's widgets: which ones, in what order, at what size. Saved per account in this
 * browser for now; syncing it to the phone ("use this layout on my phone too") comes with
 * the devices work, which adds a field for it on the server.
 */

export type WidgetSize = "s" | "m" | "l" | "xl";
export type WidgetId =
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

function read(userId: string): Slot[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return DEFAULT_LAYOUT;
    const known = new Map(WIDGETS.map((w) => [w.id, w]));
    const slots = (JSON.parse(raw) as Slot[]).filter((s) => known.has(s.id));
    return slots.map((s) => ({ id: s.id, size: known.get(s.id)!.sizes.includes(s.size) ? s.size : known.get(s.id)!.defaultSize }));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function createLayout(userId: string) {
  let slots = $state<Slot[]>(read(userId));

  function save() {
    try { localStorage.setItem(key(userId), JSON.stringify(slots)); } catch {}
  }

  return {
    get slots() { return slots; },
    get hidden() { return WIDGETS.filter((w) => !slots.some((s) => s.id === w.id)); },
    move(id: WidgetId, by: -1 | 1) {
      const i = slots.findIndex((s) => s.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= slots.length) return;
      const next = [...slots];
      [next[i], next[j]] = [next[j]!, next[i]!];
      slots = next;
      save();
    },
    /** Drag and drop: put `id` where `beforeId` is. */
    moveTo(id: WidgetId, beforeId: WidgetId) {
      if (id === beforeId) return;
      const moving = slots.find((s) => s.id === id);
      if (!moving) return;
      const rest = slots.filter((s) => s.id !== id);
      const at = rest.findIndex((s) => s.id === beforeId);
      rest.splice(at < 0 ? rest.length : at, 0, moving);
      slots = rest;
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
      const def = WIDGETS.find((w) => w.id === id);
      if (!def || slots.some((s) => s.id === id)) return;
      slots = [...slots, { id, size: def.defaultSize }];
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
