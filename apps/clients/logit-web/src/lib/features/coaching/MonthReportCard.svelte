<!-- Canvas W7: a month sent to a client, as a card in the conversation: the coach's note, then
     the numbers. No photos. -->
<script lang="ts">
  import type { MonthReport } from "@logit/core/domain/monthReport";
  let { report, from, mine = false }: { report: MonthReport; from: string; mine?: boolean } = $props();
</script>

<article class="w-[min(100%,340px)] rounded-[14px] border border-border bg-card px-4 py-3.5 text-[13px] text-card-foreground shadow-xs {mine ? 'self-end' : 'self-start'}" aria-label="{mine ? 'Their' : 'Your'} {report.label}">
  <h3 class="text-sm font-semibold">{mine ? "Their" : "Your"} {report.label}</h3>
  {#if report.note}<p class="mt-1.5 whitespace-pre-wrap leading-relaxed">“{report.note}”<span class="block pt-0.5 text-xs text-muted-foreground">— {from}</span></p>{/if}
  {#each report.sections as s (s.title)}
    <h4 class="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{s.title}</h4>
    <dl class="grid grid-cols-[1fr_auto] gap-x-3">
      {#each s.stats as st (st.label)}
        <dt class="border-t border-border py-1.5 text-muted-foreground">{st.label}</dt>
        <dd class="border-t border-border py-1.5 text-right tabular-nums">{st.value}{#if st.sublabel}<span class="block text-[11px] text-muted-foreground">{st.sublabel}</span>{/if}</dd>
      {/each}
    </dl>
  {/each}
</article>
