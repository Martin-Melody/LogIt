<!-- The reactions under a bubble (shadcn Bubble.Reactions). Clicking yours takes it back,
     clicking someone else's adds yours. -->
<script lang="ts">
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import type { DmReaction } from "@logit/core/api/dmApi";

  let { reactions, align, onpick }: { reactions: DmReaction[]; align: "start" | "end"; onpick: (emoji: string) => void } = $props();
</script>

<Bubble.Reactions side="bottom" {align} class="gap-0 p-0 ring-card has-[button]:p-0">
  {#each reactions as r (r.emoji)}
    <button type="button" aria-pressed={r.mine} aria-label="{r.emoji}, {r.count}{r.mine ? ', yours: click to take it back' : ''}"
      class="flex h-6 items-center gap-0.5 rounded-full px-1.5 text-[13px] hover:bg-accent {r.mine ? 'bg-primary/20' : ''}"
      onclick={() => onpick(r.emoji)}>
      {r.emoji}{#if r.count > 1}<span class="text-[11px] tabular-nums text-muted-foreground">{r.count}</span>{/if}
    </button>
  {/each}
</Bubble.Reactions>
