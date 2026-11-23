import type { WidgetSlot } from "./widget";

const REPLACED_BY_TODAY = ["this-week", "quick-start", "todays-plan"];

/** Today replaced This week, Quick start and Today's plan (decision D1). A Home saved before it
 * gets Today at the top and the three switched off, once; Customize can switch them back on. */
export function withTodayCard(slots: WidgetSlot[]): WidgetSlot[] {
  if (slots.some((s) => s.id === "today")) return slots;
  const top = Math.min(0, ...slots.map((s) => s.orderIndex)) - 1;
  return [
    { id: "today", enabled: true, orderIndex: top },
    ...slots.map((s) => (REPLACED_BY_TODAY.includes(s.id) ? { ...s, enabled: false } : s)),
  ];
}
