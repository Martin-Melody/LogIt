<script lang="ts">
  import { untrack } from "svelte";
  import { atTimeOn, localDateIso, timeOfDay } from "@logit/core/domain/nutrition";
  import { TimeField } from "$lib/components/ui/time-field";
  import { popIn } from "$lib/transitions";
  import { chip } from "./style";

  // "Time eaten" on a diary entry. Today starts at now; an earlier day starts with no time
  // ("now" would be wrong there). `onchange` fires only when it's changed.
  interface Props {
    dateIso: string;
    /** The entry's time when editing one; null = an entry saved without one. */
    startMs?: number | null;
    onchange: (ms: number) => void;
    class?: string;
  }
  const { dateIso, startMs, onchange, class: className = "" }: Props = $props();

  const today = $derived(dateIso === localDateIso());
  let ms = $state<number | undefined>(untrack(() => startMs ?? (startMs === undefined && dateIso === localDateIso() ? Date.now() : undefined)));
  let isNow = $state(untrack(() => startMs === undefined));

  function set(v: number, now = false) {
    ms = v;
    isNow = now;
    onchange(v);
  }
</script>

<div class="flex items-center gap-2.5 {className}">
  <span class="flex-1 text-sm">Time eaten</span>
  {#if ms === undefined}
    <button type="button" class={chip(false, "border-dashed")} in:popIn onclick={() => set(atTimeOn(dateIso, timeOfDay(Date.now())))}>Add a time</button>
  {:else}
    {#if today && isNow}
      <span class="text-[13px] text-muted-foreground" in:popIn>Now</span>
    {:else if today}
      <button type="button" class={chip(false)} in:popIn onclick={() => set(Date.now(), true)}>Use now</button>
    {/if}
    <TimeField aria-label="Time eaten" value={timeOfDay(ms)} onchange={(v) => set(atTimeOn(dateIso, v))} />
  {/if}
</div>
