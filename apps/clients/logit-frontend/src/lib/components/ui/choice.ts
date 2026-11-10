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
export const segmentTrack = "flex h-10 items-stretch gap-0.5 rounded-lg bg-muted p-[3px] text-sm";

export function segment(selected: boolean, className?: string): string {
  return cn(
    "inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 font-medium tabular-nums transition-colors disabled:opacity-50",
    selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    className,
  );
}

export function chip(selected: boolean, className?: string): string {
  return cn(
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    className,
  );
}
