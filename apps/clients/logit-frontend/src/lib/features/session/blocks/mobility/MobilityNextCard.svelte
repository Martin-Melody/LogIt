<script lang="ts">
  // A drill's next step once its area has about 10 minutes this week (design canvas M1/M2,
  // Martin's reviewed design): load, else the next harder cue and harder drills, else pick one.
  import { reveal } from "$lib/transitions";
  import { chip } from "$lib/components/ui/choice";
  import { MOBILITY_AREA_LABEL } from "@logit/core/domain/library";
  import type { MobilityNextStep } from "@logit/core/domain/mobilityProgression";
  import type { MobilityArea } from "@logit/core/domain/mobilityDrill";

  let { next, unitLabel, loadInUnit, onAddLoad, onCue, onNotYet, onHarder, onPick }: {
    next: MobilityNextStep;
    unitLabel: string;
    /** The suggested load, in the person's unit. */
    loadInUnit: number | null;
    onAddLoad: (kg: number) => void;
    onCue: () => void;
    onNotYet: () => void;
    onHarder: (drill: { id: string; name: string }) => void;
    onPick: () => void;
  } = $props();

  const area = $derived(MOBILITY_AREA_LABEL[next.areaWeek.area as MobilityArea] ?? next.areaWeek.area);
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const pct = $derived(Math.min(100, (next.areaWeek.doneSec / next.areaWeek.targetSec) * 100));
</script>

<div class="mx-3 my-2 flex flex-col gap-2.5 rounded-lg bg-muted p-3" transition:reveal>
  <div class="flex flex-col gap-1">
    <div class="flex justify-between gap-2 text-[13px]">
      <span class="font-semibold first-letter:uppercase">{area} this week</span>
      <span class="tabular-nums">{mmss(next.areaWeek.doneSec)} of ~{Math.round(next.areaWeek.targetSec / 60)} min</span>
    </div>
    <div class="h-1.5 rounded-full bg-background"><div class="h-1.5 rounded-full bg-green-700 transition-[width] dark:bg-green-500" style="width: {pct}%"></div></div>
  </div>

  {#if next.load}
    <p class="text-[13px] leading-snug">You've done enough time for your {area} this week; more won't add much. The next step is load: <strong>{loadInUnit} {unitLabel}</strong> on this one.</p>
    <div class="grid grid-cols-2 gap-2">
      <button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={() => onAddLoad(next.load!.kg)}>Add {loadInUnit} {unitLabel}</button>
      <button type="button" class="h-10 rounded-lg border border-border bg-background text-sm font-medium" onclick={onNotYet}>Not yet</button>
    </div>
  {:else}
    <p class="text-[13px] leading-snug">
      Enough time for your {area} this week.
      {#if next.cue}Make it harder where you are first:{:else if next.harder?.length}Move on to a harder stretch:{:else}LogIt doesn't know a harder version of this one yet.{/if}
    </p>
    {#if next.cue}
      <div class="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5">
        <span class="text-xs font-semibold text-muted-foreground">Next step · {next.cue.step} of {next.cue.of}</span>
        <span class="text-[15px] font-semibold">{next.cue.text}</span>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={onCue}>Try it today</button>
          <button type="button" class="h-10 rounded-lg border border-border text-sm font-medium" onclick={onNotYet}>Not yet</button>
        </div>
      </div>
    {/if}
    {#if next.harder?.length}
      {#if next.cue}<span class="text-xs font-semibold text-muted-foreground">Or move on to a harder stretch</span>{/if}
      <div class="flex flex-wrap gap-1.5">
        {#each next.harder as d (d.name)}
          <button type="button" class={chip(false, "h-10 px-3 text-[13px]")} onclick={() => onHarder(d)}>{d.name}</button>
        {/each}
        <button type="button" class={chip(false, "h-10 px-3 text-[13px] border-dashed")} onclick={onPick}>Something else…</button>
      </div>
      {#if !next.cue}
        <button type="button" class="h-10 self-start rounded-lg border border-border bg-background px-3 text-sm font-medium" onclick={onNotYet}>Not yet</button>
      {/if}
    {:else if next.pickHarder}
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="h-10 rounded-lg {next.cue ? 'border border-border bg-background font-medium' : 'bg-primary font-semibold text-primary-foreground'} text-sm" onclick={onPick}>Pick a harder drill</button>
        {#if !next.cue}<button type="button" class="h-10 rounded-lg border border-border bg-background text-sm font-medium" onclick={onNotYet}>Not yet</button>{/if}
      </div>
    {/if}
  {/if}
</div>
