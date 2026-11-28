<!-- A new program starts with its weeks (canvas PW1): a name, how many weeks, then the first
     stretch (weeks 1 to 3 and what they do) in one go. + Next stretch starts where the last ended.
     Skip it and every week runs the program's progression. -->
<script lang="ts">
  import { untrack } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import StretchForm from "./StretchForm.svelte";
  import StretchBar from "./StretchBar.svelte";
  import { createCoachProgram, weekRangeText } from "@logit/core/domain/CoachProgram";
  import { setLength } from "@logit/core/domain/programBuilder";
  import { createId } from "@logit/core/domain/ids";
  import { putStretch, stretchesOf, stretchTitle, stretchWhatText, type StretchInput } from "@logit/core/domain/stretches";

  let { open = $bindable(false), busy = false, oncreate }: {
    open?: boolean;
    busy?: boolean;
    oncreate: (name: string, weeks: number, stretches: StretchInput[]) => void;
  } = $props();

  let name = $state("");
  let weeks = $state(8);
  let done = $state<StretchInput[]>([]);
  let input = $state<StretchInput | null>(null);
  let placeholder = $state("");
  let form = $state(0);
  $effect(() => { if (open) untrack(() => { name = ""; weeks = 8; done = []; form += 1; }); });

  const build = (list: StretchInput[]) => list.reduce((p, s) => putStretch(p, s, () => createId("phase")), setLength(createCoachProgram(name.trim() || "New program"), weeks));
  const draft = $derived(build(done));
  const shown = $derived(stretchesOf(build(input ? [...done, input] : done)));
  const next = $derived(done.length ? Math.min(weeks, done.at(-1)!.to + 1) : 1);
  const room = $derived(!done.length || done.at(-1)!.to < weeks);

  function addNext() {
    if (!input) return;
    done = [...done, input];
    form += 1;
  }
  // Fewer weeks than the stretches cover: they end at the new last week.
  function setWeeks(n: number) {
    weeks = Math.max(1, Math.min(52, n));
    done = done.filter((s) => s.from <= weeks).map((s) => (s.to > weeks ? { ...s, to: weeks } : s));
    form += 1;
  }
  const create = (withCurrent: boolean) => oncreate(name.trim() || "New program", weeks, withCurrent && input && room ? [...done, input] : done);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[92svh] flex-col gap-3 overflow-hidden sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>New program</Dialog.Title>
      <Dialog.Description>Set up how the weeks run. You can change any of it later.</Dialog.Description>
    </Dialog.Header>
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div class="flex flex-col gap-1.5"><Label for="np-name">Name</Label><Input id="np-name" bind:value={name} placeholder="Hypertrophy block" maxlength={60} /></div>
        <div class="flex flex-col gap-1.5"><Label>How many weeks</Label>
          <span class="flex h-9 items-center gap-1.5">
            <Button variant="outline" size="icon" class="size-9" aria-label="One week fewer" disabled={weeks <= 1} onclick={() => setWeeks(weeks - 1)}>−</Button>
            <span class="w-8 text-center tabular-nums font-semibold">{weeks}</span>
            <Button variant="outline" size="icon" class="size-9" aria-label="One week more" disabled={weeks >= 52} onclick={() => setWeeks(weeks + 1)}>+</Button>
          </span>
        </div>
      </div>

      {#if done.length}
        <div class="flex flex-col">
          {#each done as s, i (i)}
            <div class="flex items-center gap-3 border-t border-border py-2 text-[13px]">
              <b class="w-20 tabular-nums">{weekRangeText(s)}</b>
              <span class="min-w-0 flex-1 truncate"><b class="font-semibold">{stretchTitle(s)}</b> <span class="text-muted-foreground">· {stretchWhatText(s, draft.rule)}</span></span>
              <Button variant="ghost" size="icon" class="size-9" aria-label="Take off {stretchTitle(s)}" onclick={() => { done = done.slice(0, i); form += 1; }}>×</Button>
            </div>
          {/each}
        </div>
      {/if}

      {#if room}
        <section class="flex flex-col gap-2 rounded-[12px] border border-border p-3.5" aria-label="Next stretch">
          {#key form}<StretchForm program={draft} stretch={null} start={{ from: next, to: done.length ? weeks : Math.min(weeks, 3) }} bind:input bind:placeholder />{/key}
          {#if input && input.to < weeks}
            <Button variant="outline" class="self-start" onclick={addNext}>+ Next stretch: {weekRangeText({ from: input.to + 1, to: weeks })}</Button>
          {/if}
        </section>
      {/if}

      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">How it runs</span>
        <StretchBar stretches={shown} total={weeks} rule={draft.rule} preview onopen={() => {}} onedge={() => {}} />
      </div>
    </div>
    <Dialog.Footer class="sm:justify-between">
      <Button variant="ghost" disabled={busy} onclick={() => oncreate(name.trim() || "New program", weeks, [])}>Skip, every week the same</Button>
      <Button disabled={busy} onclick={() => create(true)}>{busy ? "Creating…" : "Start building Day 1"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
