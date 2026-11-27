<!-- Canvas W7: your month from your coach, in the conversation: their note, then the numbers
     (from your own data; never photos). "See it in Progress" opens that month there (W12). -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { MonthReport } from "@logit/core/domain/monthReport";
  let { report, coachName }: { report: MonthReport; coachName: string } = $props();
</script>

<article class="mx-1 my-1 flex flex-col rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px]" aria-label="Your {report.label}">
  <h3 class="text-base font-semibold">Your {report.label}</h3>
  {#if report.note}<p class="mt-1.5 whitespace-pre-wrap leading-snug">“{report.note}”<span class="block pt-0.5 text-[13px] text-muted-foreground">— {coachName}</span></p>{/if}
  {#each report.sections as s (s.title)}
    <h4 class="mt-3 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{s.title}</h4>
    <dl class="grid grid-cols-[1fr_auto] gap-x-3 text-[14px]">
      {#each s.stats as st (st.label)}
        <dt class="border-t border-border py-2 text-muted-foreground">{st.label}</dt>
        <dd class="border-t border-border py-2 text-right tabular-nums">{st.value}</dd>
      {/each}
    </dl>
  {/each}
  <Button variant="outline" class="mt-3" href="/progress?tab=summary&period=month&m={report.month}">See it in Progress</Button>
</article>
