<!-- Canvas W1: last week in plain numbers. -->
<script lang="ts">
  import { lastWeek } from "../todayWeek";
  import type { CoachingOverview } from "../coachingData";

  let { overview }: { overview: CoachingOverview } = $props();
  const last = $derived(lastWeek(overview));
</script>

<section data-guide="today-week" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
  <h2 class="pb-1 text-sm font-semibold">Last week</h2>
  <dl class="grid grid-cols-[1fr_auto] text-[13px]">
    {#if last.sessions}<dt class="border-t border-border py-2.5 text-muted-foreground">Sessions done</dt><dd class="border-t border-border py-2.5 text-right tabular-nums">{last.sessions.done} of {last.sessions.planned} planned</dd>{/if}
    {#if last.checkins}<dt class="border-t border-border py-2.5 text-muted-foreground">Check-ins in</dt><dd class="border-t border-border py-2.5 text-right tabular-nums">{last.checkins.done} of {last.checkins.due}</dd>{/if}
    {#if last.food}<dt class="border-t border-border py-2.5 text-muted-foreground">Food logged 5+ days</dt><dd class="border-t border-border py-2.5 text-right tabular-nums">{last.food.logged} of {last.food.sharing} who share it</dd>{/if}
    <dt class="border-t border-border py-2.5 text-muted-foreground">Quiet for 7+ days</dt>
    <dd class="border-t border-border py-2.5 text-right">{#each last.quiet as q, n (q.id)}{n ? ", " : ""}<a href="/clients/{q.id}?tab=training" class="hover:underline">{q.name}</a>{:else}<span class="text-muted-foreground">Nobody</span>{/each}</dd>
  </dl>
</section>
