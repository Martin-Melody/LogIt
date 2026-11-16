<script lang="ts">
  import { INSIGHT_RANGES, type InsightRange } from "@logit/core/domain/insights";

  let { value, onchange, label = "Range" }: { value: InsightRange; onchange: (r: InsightRange) => void; label?: string } = $props();
</script>

<div role="group" aria-label={label} class="inline-flex flex-wrap gap-0.5 rounded-[9px] bg-muted p-[3px]">
  {#each INSIGHT_RANGES as r (r.id)}
    <button
      type="button"
      aria-pressed={value === r.id}
      onclick={() => onchange(r.id)}
      class="h-[30px] rounded-[7px] px-3 text-xs {value === r.id ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
    >{r.label}</button>
  {/each}
</div>
