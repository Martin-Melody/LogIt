<script lang="ts">
  import { untrack } from "svelte";
  import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Flame } from "lucide-svelte";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import type { WeeklyStreak } from "@logit/core/domain/weeklyStreak";

  // A month (or one week) of training days: filled = trained, a small "2" = two workouts,
  // ringed = today. Tapping a day picks it (again to let go). While searching, `matchDays`
  // fills only the days with a match and greys the other training days.
  let {
    workoutsByDay,
    matchDays = null,
    selected = null,
    expanded = $bindable(true),
    streak = null,
    monthCount = null,
    onSelect,
  }: {
    workoutsByDay: Map<string, number>;
    matchDays?: Set<string> | null;
    selected?: string | null;
    expanded?: boolean;
    streak?: WeeklyStreak | null;
    monthCount?: number | null;
    onSelect: (dayIso: string | null) => void;
  } = $props();

  const todayIso = localDateIso(new Date());

  function parseIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  }
  function mondayOf(d: Date): Date {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    return r;
  }
  function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // The month (or week) on screen; follows a picked day.
  let cursor = $state(untrack(() => (selected ? parseIso(selected) : new Date())));
  $effect(() => {
    if (selected) cursor = parseIso(selected);
  });

  type Cell = { iso: string; n: number; inRange: boolean; future: boolean; count: number };

  const cells = $derived.by((): Cell[] => {
    let start: Date;
    let length: number;
    const month = cursor.getMonth();
    if (expanded) {
      const first = new Date(cursor.getFullYear(), month, 1);
      start = mondayOf(first);
      const last = new Date(cursor.getFullYear(), month + 1, 0);
      length = Math.ceil(((last.getTime() - start.getTime()) / 86_400_000 + 1) / 7) * 7;
    } else {
      start = mondayOf(cursor);
      length = 7;
    }
    return Array.from({ length }, (_, i) => {
      const d = addDays(start, i);
      const iso = localDateIso(d);
      return {
        iso,
        n: d.getDate(),
        inRange: !expanded || d.getMonth() === month,
        future: iso > todayIso,
        count: workoutsByDay.get(iso) ?? 0,
      };
    });
  });

  const title = $derived.by(() => {
    if (expanded) return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const start = mondayOf(cursor);
    const end = addDays(start, 6);
    const a = start.toLocaleDateString(undefined, { day: "numeric", ...(start.getMonth() !== end.getMonth() ? { month: "short" } : {}) });
    const b = end.toLocaleDateString(undefined, { day: "numeric", month: "long" });
    return `${a} – ${b}`;
  });

  const canGoForward = $derived.by(() => {
    if (expanded) return new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) <= new Date();
    return localDateIso(addDays(mondayOf(cursor), 7)) <= todayIso;
  });

  function step(dir: 1 | -1) {
    cursor = expanded
      ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1)
      : addDays(cursor, 7 * dir);
  }

  function label(c: Cell): string {
    const d = parseIso(c.iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    if (c.count === 0) return d;
    return `${d}, ${c.count} workout${c.count === 1 ? "" : "s"}`;
  }

  const footer = $derived.by(() => {
    const parts: string[] = [];
    if (streak && !streak.pausedNow) {
      const { done, needed } = streak.thisWeek;
      parts.push(done >= needed ? `${done} day${done === 1 ? "" : "s"} this week ✓` : `This week ${done} of ${needed} days`);
    } else if (streak?.pausedNow) parts.push("Paused");
    if (monthCount != null) parts.push(`${monthCount} this month`);
    return parts.join(" · ");
  });

  const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
</script>

<section aria-label="Training calendar" class="flex flex-col gap-2 rounded-xl border bg-card px-3 pt-2 pb-2.5">
  <div class="flex items-center gap-1">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      aria-label={expanded ? "Previous month" : "Previous week"}
      onclick={() => step(-1)}
    >
      <ChevronLeft class="h-4 w-4" />
    </button>
    <span class="flex-1 text-center text-sm font-semibold">{title}</span>
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
      aria-label={expanded ? "Next month" : "Next week"}
      disabled={!canGoForward}
      onclick={() => step(1)}
    >
      <ChevronRight class="h-4 w-4" />
    </button>
    <button
      type="button"
      class="flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? "Week" : "Month"}
      {#if expanded}<ChevronUp class="h-3.5 w-3.5" />{:else}<ChevronDown class="h-3.5 w-3.5" />{/if}
    </button>
  </div>

  <div class="grid grid-cols-7 gap-y-0.5" role="grid">
    {#each WEEKDAYS as w, i (i)}
      <span class="pb-1 text-center text-[11px] font-medium text-muted-foreground" aria-hidden="true">{w}</span>
    {/each}
    {#each cells as c (c.iso)}
      {@const trained = c.count > 0}
      {@const match = !matchDays || matchDays.has(c.iso)}
      {@const isSelected = selected === c.iso}
      {#if !c.inRange}
        <span class="h-10" aria-hidden="true"></span>
      {:else}
        <button
          type="button"
          class="relative flex h-10 items-center justify-center disabled:cursor-default"
          aria-label={label(c)}
          aria-pressed={isSelected}
          disabled={!trained && !isSelected}
          onclick={() => onSelect(isSelected ? null : c.iso)}
        >
          <span
            class="flex items-center justify-center rounded-full text-[13px] tabular-nums transition-colors
              {c.iso === todayIso ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}
              {isSelected ? 'outline-2 outline-offset-2 outline-info' : ''}
              {trained && match
                ? 'h-8 w-8 bg-foreground font-semibold text-background'
                : trained
                  ? 'h-8 w-8 bg-muted font-semibold text-foreground'
                  : c.future
                    ? 'h-8 w-8 text-muted-foreground'
                    : 'h-8 w-8 text-foreground'}"
          >
            {c.n}
          </span>
          {#if c.count > 1}
            <span
              class="absolute top-0.5 right-[calc(50%-1.35rem)] flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-[1.5px] border-foreground bg-card px-0.5 text-[9px] font-bold leading-none"
              aria-hidden="true">{c.count}</span
            >
          {/if}
        </button>
      {/if}
    {/each}
  </div>

  {#if matchDays}
    <p class="text-center text-[11px] text-muted-foreground">Dark: has a match · Grey: trained, no match</p>
  {:else if streak || monthCount != null}
    <div class="flex items-center justify-between gap-2 border-t border-border pt-2">
      {#if streak}
        <span class="flex items-center gap-1.5 text-[13px] font-medium">
          <Flame class="h-4 w-4 {streak.currentWeeks > 0 ? 'text-amber-500' : 'text-muted-foreground'}" />
          {streak.currentWeeks}-week streak
        </span>
      {/if}
      <span class="text-xs text-muted-foreground tabular-nums">{footer}</span>
    </div>
  {/if}
</section>
