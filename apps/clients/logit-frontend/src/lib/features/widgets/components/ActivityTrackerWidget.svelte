<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { getWorkoutRepo } from "$lib/data/repoProvider";

  // YYYY-MM-DD → session ID for completed sessions
  let sessionByDay = $state(new Map<string, string>());
  let loading = $state(true);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  const monthLabel = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Monday=0 offset for the 1st of the month (JS getDay: 0=Sun,1=Mon,...6=Sat)
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7; // shift so Mon=0

  // Flat cell array: null = padding, number = day of month
  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dayHeaders = ["M", "T", "W", "T", "F", "S", "S"];

  const todayDay = today.getMonth() === month && today.getFullYear() === year
    ? today.getDate()
    : null;

  function dayKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const workoutsThisMonth = $derived(
    [...sessionByDay.keys()].filter((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)).length,
  );

  onMount(async () => {
    try {
      const repo = getWorkoutRepo();
      const sessions = await repo.listAllSessions();
      const map = new Map<string, string>();
      for (const s of sessions) {
        if (!s.endedAtMs) continue;
        const d = new Date(s.endedAtMs);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        // Keep the most recent session if multiple exist on the same day
        if (!map.has(key)) map.set(key, s.id);
      }
      sessionByDay = map;
    } finally {
      loading = false;
    }
  });
</script>

<Card.Root>
  <Card.Header class="pb-2">
    <div class="flex items-center justify-between gap-2">
      <Card.Title>Activity</Card.Title>
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        onclick={() => void goto("/activity")}
      >
        {#if !loading}
          {workoutsThisMonth} workout{workoutsThisMonth === 1 ? "" : "s"} this month ›
        {/if}
      </button>
    </div>
    <Card.Description>{monthLabel}</Card.Description>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else}
      <div class="flex flex-col gap-1">
        <!-- Day-of-week headers -->
        <div class="grid grid-cols-7 gap-1 mb-0.5">
          {#each dayHeaders as h, i (i)}
            <div class="text-center text-[10px] text-muted-foreground leading-none">{h}</div>
          {/each}
        </div>

        <!-- Month grid -->
        {#each weeks as week, wi (wi)}
          <div class="grid grid-cols-7 gap-1">
            {#each week as day, di (di)}
              {#if day === null}
                <div class="aspect-square"></div>
              {:else}
                {@const key = dayKey(day)}
                {@const sessionId = sessionByDay.get(key)}
                {@const worked = !!sessionId}
                {@const isToday = day === todayDay}
                {@const isFuture = day > (todayDay ?? daysInMonth)}
                <button
                  type="button"
                  disabled={!worked}
                  onclick={() => worked && sessionId && void goto(`/sessions/${sessionId}`)}
                  class="aspect-square rounded-[3px] flex items-center justify-center text-[10px] leading-none w-full
                    {worked
                      ? 'bg-primary text-primary-foreground font-medium active:opacity-70'
                      : isFuture
                        ? 'bg-muted/40 text-muted-foreground/40 cursor-default'
                        : 'bg-muted text-muted-foreground cursor-default'}
                    {isToday ? 'ring-1 ring-primary ring-offset-1 ring-offset-card' : ''}"
                >
                  {day}
                </button>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
