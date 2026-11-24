<!-- Right after a set is ticked (design canvas S-D): one optional question in the row, no
     sheet and no wait. Drawn as the app's segmented control (merged design). Ignored, it goes
     when the next set starts or the rest is over. -->
<script lang="ts">
  import { EFFORT } from "./effort";
  import { segment, segmentTrack } from "$lib/components/ui/choice";

  let { setNumber = null, onAnswer }: { setNumber?: number | null; onAnswer: (rpe: number) => void } = $props();
</script>

<div class="flex flex-col gap-1.5 bg-muted/40 px-3 pb-2.5 pt-1" data-testid="effort-prompt" data-no-tab-swipe>
  <span class="text-xs text-muted-foreground" id="effort-q-{setNumber}">{setNumber ? `Set ${setNumber}: how` : "How"} many more could you have done?</span>
  <div role="group" aria-labelledby="effort-q-{setNumber}" class={segmentTrack}>
    {#each EFFORT as e (e.rpe)}
      <button type="button" class={segment(false)} aria-label="{e.left === '0' ? 'Nothing' : e.left} left" onclick={() => onAnswer(e.rpe)}>{e.left}</button>
    {/each}
  </div>
</div>
