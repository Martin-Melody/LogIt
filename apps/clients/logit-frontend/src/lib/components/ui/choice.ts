import { cn } from "$lib/utils.js";

/**
 * The two looks for "pick one" controls, so every screen draws them the same way.
 *
 * - Segmented: a fixed row of options (theme, units, RPE, set type). Grey track,
 *   selected option raised — the same look as <Tabs>. Put `segmentTrack` on the
 *   container and `segment(selected)` on each button.
 * - Chip: filters and wrapping lists (exercise filter, settings sections,
 *   machines). Rounded pill, filled when selected.
 */
export const segmentTrack = "flex h-11 items-stretch gap-0.5 rounded-lg bg-muted p-[3px] text-sm";

export function segment(selected: boolean, className?: string): string {
  return cn(
    // The ::after stretches the tap area over the track's 3px padding, so the
    // whole 44px track height is the target (the touch-size guideline, decision D10), not just the 38px pill.
    "relative inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 font-medium tabular-nums transition-colors disabled:opacity-50 after:absolute after:-inset-y-[3px] after:inset-x-0 after:content-['']",
    selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    className,
  );
}

export function chip(selected: boolean, className?: string): string {
  return cn(
    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    className,
  );
}

/**
 * "Add here" buttons (Add a set, Warm-up ramp, Session note…): a dashed outline, so they read
 * as a place to add something and not as content (DESIGN.md › Buttons).
 */
export const addButton =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-input px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50";

export type TagTone = "up" | "plan" | "warn" | "new" | "done" | "neutral";

/** One tag shape everywhere (DESIGN.md › Tags): tinted fill, no outline; the tone says what kind. */
export function tagClass(tone: TagTone, className?: string): string {
  return cn(
    "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold tabular-nums",
    {
      up: "bg-foreground/12 text-foreground",
      plan: "bg-info/15 text-info",
      warn: "bg-warning/15 text-warning",
      new: "bg-foreground/6 text-muted-foreground",
      done: "bg-success/15 text-success",
      neutral: "bg-muted text-foreground",
    }[tone],
    className,
  );
}

/** A row in a bottom-sheet menu (exercise menu, workout menu): icon, label, value on the right. */
export const menuRow =
  "flex min-h-[54px] w-full items-center gap-3.5 border-t border-border px-2 text-left text-[15px] transition-colors hover:bg-muted/40 disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0";
