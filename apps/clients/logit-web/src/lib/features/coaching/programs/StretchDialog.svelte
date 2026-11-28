<!-- A stretch of weeks (canvas PW3): weeks from–to, a name, and what they do: find your weights, a
     progression, a pack's phase, or a kind of week (Deload, Test, the coach's own). Replaces the
     phase dialog and the per-week type menu. Asks before taking weeks from another stretch. -->
<script lang="ts" module>
  import type { PhasePack } from "@logit/core/plugins/phasePack";
  export type StretchPack = PhasePack & { name: string; description: string };
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import StretchForm from "./StretchForm.svelte";
  import { weekRangeText, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import { stretchesCovered, stretchTitle, type Stretch, type StretchInput } from "@logit/core/domain/stretches";

  let { open = $bindable(false), program, stretch, start, packs = [], onsave, onremove }: {
    open?: boolean;
    program: CoachProgram;
    stretch: Stretch | null;
    start?: { from: number; to: number };
    packs?: StretchPack[];
    onsave: (s: StretchInput, replacing: Stretch | null) => void;
    onremove?: (s: Stretch) => void;
  } = $props();

  let input = $state<StretchInput | null>(null);
  let placeholder = $state("");
  let asking = $state<Stretch[] | null>(null);
  let opened = $state(0);
  $effect(() => { if (open) untrack(() => { asking = null; opened += 1; }); });

  function save(sure = false) {
    if (!input) return;
    const covered = stretchesCovered(program, input, stretch);
    if (!sure && covered.length) { asking = covered; return; }
    onsave(input, stretch);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3 overflow-hidden sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{stretch && !stretch.plain ? stretchTitle(stretch) : "Weeks of " + program.name}</Dialog.Title>
      <Dialog.Description class="sr-only">A range of weeks and what they do.</Dialog.Description>
    </Dialog.Header>
    {#if asking && input}
      <div class="flex flex-col gap-2 text-[13px]">
        <b class="font-semibold">{weekRangeText(input)}?</b>
        {#each asking as s (s.key + s.from)}
          {@const r = { from: Math.max(s.from, input.from), to: Math.min(s.to, input.to) }}
          {@const all = r.from === s.from && r.to === s.to}
          {@const becomes = input.what.kind === "week" && s.what.kind !== "week" ? `${input.name || placeholder} ${r.from === r.to ? "week" : "weeks"}` : `part of ${input.name || placeholder}`}
          <p>{all ? `Your ${stretchTitle(s)} (${weekRangeText(s).toLowerCase()}) becomes ${becomes}.` : `${weekRangeText(r)} of ${stretchTitle(s)} become ${becomes}.`}</p>
        {/each}
      </div>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => (asking = null)}>Back</Button>
        <Button onclick={() => save(true)}>Change it</Button>
      </Dialog.Footer>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        {#key opened}<StretchForm {program} {stretch} {start} {packs} bind:input bind:placeholder />{/key}
      </div>
      <Dialog.Footer class="sm:justify-between">
        <span>{#if stretch && !stretch.plain && onremove}<Button variant="ghost" class="text-destructive" onclick={() => { onremove(stretch); open = false; }}>Remove</Button>{/if}</span>
        <span class="flex gap-2"><Button variant="outline" onclick={() => (open = false)}>Cancel</Button><Button disabled={!input} onclick={() => save()}>Save</Button></span>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
