<script lang="ts">
  import type { WidgetCalendarHeatmapNode } from "@logit/core/plugins/widgetView";
  import { runWidgetAction } from "../widgetAction";

  const { node }: { node: WidgetCalendarHeatmapNode } = $props();

  const [year, month] = $derived(node.month.split("-").map(Number)); // month 1-indexed
  const byDay = $derived(new Map(node.days.map((d) => [d.day, d])));

  const grid = $derived.by(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const offset = (firstDow + 6) % 7; // Mon=0
    const cells: (number | null)[] = [
      ...Array<null>(offset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  });

  const now = new Date();
  const todayDay = $derived(
    now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : null,
  );
</script>

<div class="flex flex-col gap-1">
  <div class="grid grid-cols-7 gap-1">
    {#each ["M", "T", "W", "T", "F", "S", "S"] as h, i (i)}
      <div class="text-center text-[10px] leading-none text-muted-foreground">{h}</div>
    {/each}
  </div>
  {#each grid as week, wi (wi)}
    <div class="grid grid-cols-7 gap-1">
      {#each week as day, di (di)}
        {#if day === null}
          <div class="aspect-square"></div>
        {:else}
          {@const entry = byDay.get(day)}
          {@const worked = !!entry}
          <button
            type="button"
            disabled={!entry?.action}
            onclick={() => entry?.action && runWidgetAction(entry.action)}
            aria-label={`${day}${worked ? " — worked out" : ""}`}
            class="flex aspect-square w-full items-center justify-center rounded-[3px] text-[10px] leading-none
              {worked ? 'bg-primary font-medium text-primary-foreground active:opacity-70' : 'bg-muted text-muted-foreground'}
              {day === todayDay ? 'ring-1 ring-primary ring-offset-1 ring-offset-card' : ''}"
          >
            {day}
          </button>
        {/if}
      {/each}
    </div>
  {/each}
</div>
