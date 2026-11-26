<!-- The reactions under a bubble (shadcn Bubble.Reactions). Tapping your own takes it back,
     tapping someone else's adds yours. -->
<script lang="ts">
  import * as Bubble from "$lib/components/ui/bubble/index.js";
  import type { DmReaction } from "@logit/core/api/dmApi";

  let { reactions, align, onpick }: { reactions: DmReaction[]; align: "start" | "end"; onpick: (emoji: string) => void } = $props();
</script>

<Bubble.Reactions side="bottom" {align} class="gap-0 p-0 ring-background has-[button]:p-0">
  {#each reactions as r (r.emoji)}
    <button type="button" aria-pressed={r.mine} aria-label="{r.emoji}, {r.count}{r.mine ? ', yours: tap to take it back' : ''}"
      class="flex h-7 items-center gap-0.5 rounded-full px-1.5 text-[14px] {r.mine ? 'bg-primary/20' : ''}"
      onclick={(e) => { e.stopPropagation(); onpick(r.emoji); }}>
      {r.emoji}{#if r.count > 1}<span class="text-[12px] tabular-nums text-muted-foreground">{r.count}</span>{/if}
    </button>
  {/each}
</Bubble.Reactions>
