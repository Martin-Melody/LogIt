// Week types (Phase 6.4, canvas PB5): a coach names each week and says what's different about it,
// on top of what the progression works out. Replaces "lighter weeks". A week's change applies to
// every exercise that week; "pauses" means the progression doesn't move on that week (a deload),
// so the next normal week carries on from the one before.

export type WeekKind = "normal" | "intro" | "deload" | "heavy" | "test" | "find" | "own";

export type WeekType = {
  kind: WeekKind;
  /** The coach's name for their own type ("Peak"); built-in kinds use their own label. */
  name?: string;
  /** Sets: × this (deload ½), then + setsDelta; at least 1. */
  setsTimes?: number;
  setsDelta?: number;
  /** Load: + this % (intro −10, heavy +5). */
  loadPct?: number;
  /** Reps: + this (heavy −2). */
  repsDelta?: number;
  /** The last set is as many as you can ("5+"). */
  lastSetAmrap?: boolean;
  progression: "moves" | "pauses";
};

/** LogIt's own types (the coach's own are whatever they save). */
export const WEEK_TYPES: Record<Exclude<WeekKind, "own">, WeekType & { label: string; text: string }> = {
  normal: { kind: "normal", progression: "moves", label: "Normal", text: "The progression decides" },
  intro: { kind: "intro", loadPct: -10, progression: "moves", label: "Intro", text: "Easier start: load −10%" },
  deload: { kind: "deload", setsTimes: 0.5, progression: "pauses", label: "Deload", text: "Half the sets, same weights; the progression pauses" },
  heavy: { kind: "heavy", loadPct: 5, repsDelta: -2, progression: "moves", label: "Heavy", text: "Load +5%, 2 fewer reps" },
  test: { kind: "test", lastSetAmrap: true, progression: "moves", label: "Test", text: "Last set as many as you can; it sets the next estimate" },
  find: { kind: "find", progression: "pauses", label: "Find your weights", text: "Work up to the weights that fit; planned from there after" },
};

/** A week's type: its own, or the old "lighter" flag read as a deload; null for a normal week. */
export function weekTypeOf(week: { type?: WeekType; lighter?: boolean }): WeekType | null {
  if (week.type && week.type.kind !== "normal") return week.type;
  return week.lighter ? WEEK_TYPES.deload : null;
}

/** "Deload", or the coach's own name. */
export function weekTypeLabel(t: WeekType | null): string {
  if (!t) return "Normal";
  return t.kind === "own" ? (t.name?.trim() || "Own week") : WEEK_TYPES[t.kind].label;
}

/** What it changes, in words: "Half the sets · load −10% · last set as many as you can". */
export function weekTypeText(t: WeekType): string {
  if (t.kind !== "own" && t.kind !== "normal") return WEEK_TYPES[t.kind].text;
  const bits: string[] = [];
  if (t.setsTimes && t.setsTimes !== 1) bits.push(t.setsTimes === 0.5 ? "half the sets" : `sets × ${t.setsTimes}`);
  if (t.setsDelta) bits.push(`${t.setsDelta > 0 ? "+" : ""}${t.setsDelta} ${Math.abs(t.setsDelta) === 1 ? "set" : "sets"}`);
  if (t.loadPct) bits.push(`load ${t.loadPct > 0 ? "+" : "−"}${Math.abs(t.loadPct)}%`);
  if (t.repsDelta) bits.push(`${t.repsDelta > 0 ? "+" : "−"}${Math.abs(t.repsDelta)} reps`);
  if (t.lastSetAmrap) bits.push("last set as many as you can");
  if (t.progression === "pauses") bits.push("progression pauses");
  const s = bits.join(", ") || "Nothing changes";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The week's change to a planned set count. */
export function weekSets(t: WeekType | null, count: number): number {
  if (!t) return count;
  return Math.max(1, Math.round(count * (t.setsTimes ?? 1)) + (t.setsDelta ?? 0));
}

/** The week's change to a planned weight, rounded to `step`. */
export function weekWeight(t: WeekType | null, kg: number | undefined, step = 2.5): number | undefined {
  if (kg == null || !t?.loadPct) return kg;
  return Math.max(0, Math.round((kg * (1 + t.loadPct / 100)) / step) * step);
}

/** The week's change to planned reps text: "8" → "6", "6–8" → "4–6", and "+" on a test week. */
export function weekReps(t: WeekType | null, reps: string | undefined): string | undefined {
  if (!t || reps == null) return reps;
  let out = t.repsDelta ? reps.replace(/\d+/g, (n) => String(Math.max(1, Number(n) + t.repsDelta!))) : reps;
  if (t.lastSetAmrap && !out.endsWith("+")) out = `${out}+`;
  return out;
}
