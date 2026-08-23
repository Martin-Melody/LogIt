<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronLeft } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { getWorkoutRepo } from "$lib/data/repoProvider";

  // YYYY-MM-DD → true for completed sessions
  let workedDays = $state(new Set<string>());
  let loading = $state(true);
  let error = $state<string | null>(null);

  const today = new Date();
  const currentYear = today.getFullYear();

  // --- Year grid (GitHub-style: 52+ weeks × 7 days) ---

  // Start from the Monday on or before Jan 1 of this year
  function mondayOnOrBefore(d: Date): Date {
    const day = d.getDay(); // 0=Sun
    const diff = (day + 6) % 7; // offset to Monday
    const m = new Date(d);
    m.setDate(d.getDate() - diff);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  const jan1 = new Date(currentYear, 0, 1);
  const gridStart = mondayOnOrBefore(jan1);

  // Build all days from gridStart until Dec 31 (inclusive), padded to full weeks
  function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function toKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const dec31 = new Date(currentYear, 11, 31);
  const gridEnd = addDays(dec31, (6 - (dec31.getDay() + 6) % 7)); // last Sunday of final week

  // Build columns (weeks), each with 7 day entries
  type DayCell = { date: Date; key: string; inYear: boolean; isFuture: boolean };
  type WeekColumn = DayCell[];

  const columns: WeekColumn[] = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      week.push({
        date,
        key: toKey(date),
        inYear: date.getFullYear() === currentYear,
        isFuture: date > today,
      });
      cursor = addDays(cursor, 1);
    }
    columns.push(week);
  }

  // Month labels: find the column index where each month starts
  const monthLabels: { label: string; colIndex: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const firstOfMonth = new Date(currentYear, m, 1);
    const colIndex = columns.findIndex(
      (week) => week.some((d) => d.date >= firstOfMonth && d.date.getMonth() === m),
    );
    if (colIndex !== -1) {
      monthLabels.push({
        label: firstOfMonth.toLocaleDateString(undefined, { month: "short" }),
        colIndex,
      });
    }
  }

  // --- Stats ---
  const statsYear = $derived.by(() => {
    if (workedDays.size === 0) return { workouts: 0, currentStreak: 0, bestStreak: 0 };

    const prefix = String(currentYear);
    const yearDays = [...workedDays].filter((k) => k.startsWith(prefix)).sort();
    const workouts = yearDays.length;

    // Current streak: walk backwards from today
    let currentStreak = 0;
    let d = new Date(today);
    d.setHours(0, 0, 0, 0);
    while (workedDays.has(toKey(d))) {
      currentStreak++;
      d = addDays(d, -1);
    }

    // Best streak in the year
    let bestStreak = 0;
    let streak = 0;
    let prev: Date | null = null;
    for (const key of yearDays) {
      const [y, mo, dy] = key.split("-").map(Number);
      const date = new Date(y!, (mo! - 1), dy!);
      if (prev && (date.getTime() - prev.getTime()) === 86_400_000) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak > bestStreak) bestStreak = streak;
      prev = date;
    }

    return { workouts, currentStreak, bestStreak };
  });

  // Monthly breakdown
  const monthStats = $derived.by(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const prefix = `${currentYear}-${String(m + 1).padStart(2, "0")}-`;
      return [...workedDays].filter((k) => k.startsWith(prefix)).length;
    });
  });

  onMount(async () => {
    try {
      const repo = getWorkoutRepo();
      const sessions = await repo.listAllSessions();
      const keys = new Set<string>();
      for (const s of sessions) {
        if (!s.endedAtMs) continue;
        const d = new Date(s.endedAtMs);
        keys.add(toKey(d));
      }
      workedDays = keys;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      loading = false;
    }
  });
</script>

<div class="flex flex-col pb-24 min-h-screen">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-3 border-b border-border">
    <button
      type="button"
      class="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onclick={() => void goto("/")}
      aria-label="Back"
    >
      <ChevronLeft class="h-5 w-5" />
    </button>
    <h1 class="text-base font-semibold">Activity — {currentYear}</h1>
  </div>

  <div class="flex flex-col gap-3 p-3">
    {#if loading}
      <Card.Root>
        <Card.Content class="pt-6">
          <p class="text-sm text-muted-foreground">Loading…</p>
        </Card.Content>
      </Card.Root>

    {:else if error}
      <Card.Root>
        <Card.Content class="pt-6">
          <p class="text-sm text-destructive">{error}</p>
        </Card.Content>
      </Card.Root>

    {:else}
      <!-- Stats row -->
      <Card.Root>
        <Card.Content class="pt-4 pb-4">
          <div class="grid grid-cols-3 divide-x divide-border">
            <div class="text-center px-2">
              <p class="text-lg font-semibold tabular-nums">{statsYear.workouts}</p>
              <p class="text-xs text-muted-foreground mt-0.5">Workouts</p>
            </div>
            <div class="text-center px-2">
              <p class="text-lg font-semibold tabular-nums">{statsYear.currentStreak}</p>
              <p class="text-xs text-muted-foreground mt-0.5">Streak</p>
            </div>
            <div class="text-center px-2">
              <p class="text-lg font-semibold tabular-nums">{statsYear.bestStreak}</p>
              <p class="text-xs text-muted-foreground mt-0.5">Best streak</p>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Year heatmap -->
      <Card.Root class="overflow-hidden">
        <Card.Header class="pb-2">
          <Card.Title>Year overview</Card.Title>
        </Card.Header>
        <Card.Content class="pb-4">
          <div class="overflow-x-auto">
            <div class="inline-flex flex-col gap-1 min-w-max">
              <!-- Month labels -->
              <div class="flex gap-0.5 pl-5">
                {#each columns as _week, ci (ci)}
                  {@const label = monthLabels.find((l) => l.colIndex === ci)}
                  <div class="w-3 text-[9px] text-muted-foreground leading-none overflow-visible whitespace-nowrap">
                    {label ? label.label : ""}
                  </div>
                {/each}
              </div>

              <!-- Grid rows: Mon–Sun -->
              {#each [0, 1, 2, 3, 4, 5, 6] as rowIdx (rowIdx)}
                {@const dayInitial = ["M", "T", "W", "T", "F", "S", "S"][rowIdx]}
                <div class="flex items-center gap-1">
                  <span class="w-4 text-[9px] text-muted-foreground text-right shrink-0 leading-none">
                    {rowIdx % 2 === 0 ? dayInitial : ""}
                  </span>
                  <div class="flex gap-0.5">
                    {#each columns as week, ci (ci)}
                      {@const cell = week[rowIdx]}
                      {#if cell && cell.inYear}
                        <div
                          class="w-3 h-3 rounded-[2px]
                            {cell.isFuture
                              ? 'bg-muted/40'
                              : workedDays.has(cell.key)
                                ? 'bg-primary'
                                : 'bg-muted'}"
                          title={cell.key}
                        ></div>
                      {:else}
                        <div class="w-3 h-3"></div>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Month breakdown -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title>By month</Card.Title>
        </Card.Header>
        <Card.Content class="pt-0">
          {#each monthStats as count, m (m)}
            {@const label = new Date(currentYear, m, 1).toLocaleDateString(undefined, { month: "long" })}
            {@const isFutureMonth = m > today.getMonth() && currentYear === today.getFullYear()}
            <div class="flex items-center gap-3 py-2 border-b last:border-0 border-border">
              <span class="text-sm w-24 shrink-0">{label}</span>
              <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                {#if !isFutureMonth && count > 0}
                  {@const max = Math.max(...monthStats.filter((_, mi) => mi <= today.getMonth() || currentYear < today.getFullYear()))}
                  <div
                    class="h-full bg-primary rounded-full transition-all"
                    style="width: {max > 0 ? (count / max) * 100 : 0}%"
                  ></div>
                {/if}
              </div>
              <span class="text-xs text-muted-foreground w-6 text-right shrink-0 tabular-nums">
                {isFutureMonth ? "" : count}
              </span>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</div>
