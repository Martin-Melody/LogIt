<!-- Right after a set is ticked (design canvas S-D): one optional question in the row, no
     sheet and no wait. Ignored, it goes when the next set starts or the rest is over. -->
<script lang="ts">
  import { EFFORT } from "./effort";

  let { setNumber = null, onAnswer }: { setNumber?: number | null; onAnswer: (rpe: number) => void } = $props();
</script>

<div class="flex flex-col gap-1.5 px-3 pb-2.5 pt-1" data-testid="effort-prompt">
  <span class="text-[13px] text-success" id="effort-q-{setNumber}">How many more could you have done?</span>
  <div role="group" aria-labelledby="effort-q-{setNumber}" class="grid grid-cols-4 gap-1.5">
    {#each EFFORT as e (e.rpe)}
      <button type="button" class="min-h-11 rounded-lg border border-success/40 bg-background text-sm font-semibold text-success"
        aria-label="{e.left === '0' ? 'Nothing' : e.left} left" onclick={() => onAnswer(e.rpe)}>{e.left}</button>
    {/each}
  </div>
</div>
