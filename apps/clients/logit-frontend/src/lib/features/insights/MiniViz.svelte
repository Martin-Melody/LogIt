<script lang="ts">
  import type { InsightMini } from "@logit/core/domain/insights";

  /** The small picture under an answer: lift chips, muscle bars, week squares, a weight line or goal rows. */
  let { mini }: { mini: InsightMini } = $props();

  const TONE = { up: "bg-success/12 text-success", flat: "bg-warning/12 text-warning", down: "bg-destructive/12 text-destructive" };
  const WEEK = { met: "bg-success", missed: "bg-warning", skipped: "bg-muted", in_progress: "bg-muted-foreground/30" };
  const WEEK_WORD = { met: "on target", missed: "missed", skipped: "paused", in_progress: "this week" };

  const linePath = $derived.by(() => {
    if (mini.kind !== "line" || mini.values.length < 2) return "";
    const vs = mini.values;
    const lo = Math.min(...vs);
    const span = Math.max(...vs) - lo || 1;
    return vs.map((v, i) => `${i ? "L" : "M"}${((i / (vs.length - 1)) * 300).toFixed(1)},${(36 - ((v - lo) / span) * 32).toFixed(1)}`).join("");
  });
  const barMax = $derived(mini.kind === "bars" ? Math.max(1, ...mini.bars.map((b) => b.value)) : 1);
</script>

{#if mini.kind === "chips"}
  <span class="flex flex-wrap gap-1.5">
    {#each mini.chips as c (c.label)}
      <span class="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold {TONE[c.tone]}">{c.label}</span>
    {/each}
  </span>
{:else if mini.kind === "bars"}
  <span class="flex h-[54px] items-end gap-1.5" role="img" aria-label="Working sets a week: {mini.bars.map((b) => `${b.label} ${Math.round(b.value)}`).join(', ')}">
    {#each mini.bars as b (b.label)}
      <span class="flex-1 rounded-[3px] {b.low ? 'bg-chart-3' : 'bg-chart-1'}" style="height: {Math.max(4, (b.value / barMax) * 54)}px" title="{b.label}: {Math.round(b.value)}"></span>
    {/each}
  </span>
{:else if mini.kind === "weeks"}
  <span class="grid gap-1" style="grid-template-columns: repeat({mini.weeks.length}, minmax(0, 1fr))" role="img" aria-label="Weeks, oldest first: {mini.weeks.map((w) => WEEK_WORD[w]).join(', ')}">
    {#each mini.weeks as w, i (i)}
      <span class="h-4 rounded-[3px] {WEEK[w]}"></span>
    {/each}
  </span>
{:else if mini.kind === "line"}
  <svg viewBox="0 0 300 40" class="h-10 w-full" preserveAspectRatio="none" role="img" aria-label="Body weight trend from {mini.values[0]} to {mini.values.at(-1)} kg">
    <path d={linePath} fill="none" class="stroke-chart-1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
{:else if mini.kind === "rows"}
  <span class="flex flex-col gap-1.5 text-xs">
    {#each mini.rows as r (r.label)}
      <span class="flex justify-between gap-3"><span class="truncate">{r.label}</span><span class="shrink-0 text-muted-foreground">{r.value}</span></span>
    {/each}
  </span>
{/if}
