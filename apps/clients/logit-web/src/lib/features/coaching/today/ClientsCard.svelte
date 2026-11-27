<!-- Canvas W5: your clients and spots, who joined and left, who asked to be coached, and who's
     been with you longest. V4: in Practice view, the samples, which never take a spot. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { monthData } from "./monthData.svelte";

  let { month, practice = false, samples = 0 }: { month: string; practice?: boolean; samples?: number } = $props();
  const data = $derived(monthData.months[month] ?? null);
  $effect(() => void monthData.month(month).catch(() => {}));
  const spots = (n: number) => `${n} spot${n === 1 ? "" : "s"}`;
  const monthsSince = (ms: number) => Math.max(1, Math.round((Date.now() - ms) / (30.44 * 86_400_000)));
</script>

<section aria-label="Clients" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px]">
  <h2 class="pb-1 text-sm font-semibold">Clients</h2>
  {#if !data}
    <Skeleton class="h-28" />
  {:else if practice}
    <div class="flex items-baseline gap-2 border-t border-border py-2.5"><span class="text-[22px] font-bold tabular-nums">{samples}</span><span class="text-muted-foreground">sample client{samples === 1 ? "" : "s"}{data.clients.spots ? ` · not counted against your ${spots(data.clients.spots)}` : ""}</span></div>
  {:else}
    <div class="flex flex-wrap items-baseline gap-x-2 border-t border-border py-2.5">
      <span class="text-[22px] font-bold tabular-nums">{data.clients.count}</span>
      <span class="text-muted-foreground">{data.clients.spots ? `of ${spots(data.clients.spots)}` : "clients"}{data.clients.joined || data.clients.left ? ` · ${[data.clients.joined ? `+${data.clients.joined} joined` : "", data.clients.left ? `${data.clients.left} left` : ""].filter(Boolean).join(", ")}` : ""}</span>
    </div>
    <div class="flex flex-col border-t border-border py-2.5">
      <span class="flex items-baseline justify-between"><span class="text-muted-foreground">Asked to be coached</span><b class="tabular-nums">{data.asked.count}</b></span>
      {#if data.asked.count}<span class="text-xs text-muted-foreground">{[`${data.asked.joined} joined`, data.asked.waiting ? `${data.asked.waiting} on your waiting list` : "", data.asked.notAFit ? `${data.asked.notAFit} not a fit` : ""].filter(Boolean).join(" · ")}</span>{/if}
    </div>
    {#if data.longest}
      <div class="flex items-baseline justify-between border-t border-border py-2.5"><span class="text-muted-foreground">Longest with you</span><span>{data.longest.name.split(" ")[0]} · {monthsSince(data.longest.sinceMs)} month{monthsSince(data.longest.sinceMs) === 1 ? "" : "s"}</span></div>
    {/if}
  {/if}
</section>
