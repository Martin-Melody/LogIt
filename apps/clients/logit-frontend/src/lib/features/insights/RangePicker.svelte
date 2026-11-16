<script lang="ts">
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import { INSIGHT_RANGES, type InsightRange } from "@logit/core/domain/insights";

  let { value, onchange, label = "Range" }: { value: InsightRange; onchange: (r: InsightRange) => void; label?: string } = $props();
</script>

<div role="group" aria-label={label} class={segmentTrack}>
  {#each INSIGHT_RANGES as r (r.id)}
    <button type="button" aria-pressed={value === r.id} class={segment(value === r.id)} onclick={() => onchange(r.id)}>{r.label}</button>
  {/each}
</div>
