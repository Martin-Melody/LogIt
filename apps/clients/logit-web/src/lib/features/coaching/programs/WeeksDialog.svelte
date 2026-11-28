<!-- Edit weeks (canvas PW4): the program's stretches as a list, not one menu per week. Each row is a
     range of weeks and what they do; clicking one opens it (StretchDialog). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { weekRangeText, type CoachProgram } from "@logit/core/domain/CoachProgram";
  import { stretchesOf, stretchTitle, stretchWhatText, type Stretch } from "@logit/core/domain/stretches";
  import { tone } from "./StretchBar.svelte";

  let { open = $bindable(false), program, onopen, onadd }: {
    open?: boolean;
    program: CoachProgram;
    onopen: (s: Stretch) => void;
    onadd: () => void;
  } = $props();

  const stretches = $derived(stretchesOf(program));
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Weeks of {program.name}</Dialog.Title>
      <Dialog.Description>Each stretch is a range of weeks and what they do. Click one to change it.</Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3 px-1 pb-1.5 text-xs text-muted-foreground"><span>Weeks</span><span>Stretch</span><span>What changes</span></div>
      {#each stretches as s (s.key + s.from)}
        <button type="button" onclick={() => onopen(s)}
          class="grid w-full grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-x-3 border-t border-border px-1 py-2.5 text-left transition-colors hover:bg-muted/50">
          <b class="text-[13px] tabular-nums">{weekRangeText(s).replace(/^Weeks? /, "")}</b>
          <span class="flex min-w-0 items-center gap-2"><span class="size-3 shrink-0 rounded-[4px] border {tone(s)}"></span><span class="truncate text-[13px] font-semibold {s.plain ? 'text-muted-foreground' : ''}">{stretchTitle(s)}</span></span>
          <span class="text-[13px] text-muted-foreground">{s.plain ? `The program's progression · ${stretchWhatText(s, program.rule)}` : stretchWhatText(s, program.rule)}</span>
        </button>
      {/each}
    </div>
    <Dialog.Footer class="sm:justify-between">
      <Button variant="outline" onclick={onadd}>+ Stretch</Button>
      <Button onclick={() => (open = false)}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
