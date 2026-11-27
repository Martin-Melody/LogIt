<!-- Canvas W1: the week ahead. -->
<script lang="ts">
  import type { PaymentClient } from "@logit/core/domain/coachPayments";
  import { weekAhead } from "../todayWeek";
  import type { CoachingOverview } from "../coachingData";

  let { overview, payments }: { overview: CoachingOverview; payments: PaymentClient[] } = $props();
  const ahead = $derived(weekAhead(overview, payments));
  const dayName = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
</script>

<section data-guide="today-ahead" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
  <h2 class="pb-1 text-sm font-semibold">The week ahead</h2>
  {#each ahead as a, n (n)}
    <a href={a.href} class="flex items-baseline gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-80">
      <span class="w-9 shrink-0 text-xs font-medium text-muted-foreground">{dayName(a.atMs)}</span>
      <span class="flex-1">{a.text}{#if a.note}<span class="text-muted-foreground"> · {a.note}</span>{/if}</span>
    </a>
  {:else}
    <p class="border-t border-border py-3 text-[13px] text-muted-foreground">Nothing due in the next 7 days.</p>
  {/each}
</section>
