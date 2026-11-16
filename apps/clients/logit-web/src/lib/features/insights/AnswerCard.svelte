<script lang="ts">
  import LockIcon from "@lucide/svelte/icons/lock";
  import type { InsightAnswer } from "@logit/core/domain/insights";
  import MiniViz from "./MiniViz.svelte";

  let { answer, href, compact = false }: { answer: InsightAnswer; href?: string; compact?: boolean } = $props();
</script>

{#if answer.state === "locked"}
  <div class="flex h-full flex-col gap-2 rounded-[10px] border border-dashed border-border px-[18px] py-4 {compact ? '' : 'min-h-[150px]'}">
    <span class="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"><LockIcon class="size-3" aria-hidden="true" />{answer.question}</span>
    <span class="text-xs leading-relaxed text-muted-foreground">{answer.detail}</span>
  </div>
{:else}
  <svelte:element
    this={href ? "a" : "div"}
    {href}
    class="flex h-full flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4 {href ? 'transition-colors hover:border-foreground/20' : ''} {compact ? '' : 'min-h-[190px]'}"
  >
    <span class="text-[13px] font-medium text-muted-foreground">{answer.question}</span>
    <span class="flex flex-wrap items-center gap-2">
      <span class="text-[19px] font-bold leading-snug tracking-tight {answer.state === 'empty' ? 'text-foreground/80' : ''}">{answer.answer}</span>
      {#if answer.hypothesis}<span class="rounded-full bg-info/14 px-2 py-0.5 text-[11px] font-semibold text-info">Hypothesis</span>{/if}
    </span>
    {#if answer.mini}<MiniViz mini={answer.mini} />{/if}
    <span class="text-xs leading-relaxed text-muted-foreground">{answer.detail}</span>
    {#if href}<span class="mt-auto text-xs text-muted-foreground">Open ›</span>{/if}
  </svelte:element>
{/if}
