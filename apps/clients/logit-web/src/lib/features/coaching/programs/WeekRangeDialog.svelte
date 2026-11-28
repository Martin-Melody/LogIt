<!-- Exercises in some weeks (canvas PB7): "Replace from week…" ends one exercise and starts another
     in its place; "Only in some weeks…" sets the weeks one runs in. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import OptionSelect from "$lib/components/option-select.svelte";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import type { WeekRange } from "@logit/core/domain/CoachProgram";

  let {
    open = $bindable(false),
    mode,
    name,
    weeks,
    total,
    search,
    onrange,
    onreplace,
  }: {
    open?: boolean;
    mode: "replace" | "some";
    name: string;
    weeks: WeekRange | undefined;
    total: number;
    search: (q: string) => { name: string; detail?: string }[];
    onrange: (r: WeekRange | null) => void;
    onreplace: (from: number, exerciseName: string) => void;
  } = $props();

  let from = $state(1);
  let to = $state(1);
  let replacement = $state("");
  $effect(() => {
    if (!open) return;
    const start = weeks?.from ?? 1, end = weeks?.to ?? total;
    from = mode === "replace" ? Math.min(end, Math.max(start + 1, Math.ceil((start + end) / 2) + 1)) : start;
    to = end;
    replacement = "";
  });
  const start = $derived(weeks?.from ?? 1);
  const end = $derived(weeks?.to ?? total);
  const weekOptions = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => ({ value: String(lo + i), label: `Week ${lo + i}` }));
  const canReplace = $derived(mode === "replace" && replacement.trim() !== "" && from > start && from <= end);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{mode === "replace" ? `Replace ${name} from week…` : `${name} only in some weeks`}</Dialog.Title>
      <Dialog.Description>
        {mode === "replace"
          ? "It runs until the week before; the new one takes its place on the day, with the same sets, rest and progression. Its numbers start from the client's own estimate for it."
          : "It shows only in these weeks, on the client's phone and in Every week."}
      </Dialog.Description>
    </Dialog.Header>
    {#if mode === "replace"}
      <div class="flex flex-col gap-3.5">
        <div class="flex flex-col gap-1.5"><Label>From week</Label>
          <OptionSelect value={String(from)} aria-label="From week" options={weekOptions(start + 1, end)} onValueChange={(v) => (from = Number(v))} />
        </div>
        {#if replacement}
          <p class="text-[13px]">With <b class="font-semibold">{replacement}</b> <Button variant="ghost" size="sm" onclick={() => (replacement = "")}>Change</Button></p>
        {:else}
          <NamePicker id="replace-with" label="With" placeholder="Search exercises" autofocus {search} onPick={(n) => (replacement = n)} />
        {/if}
        {#if from <= end && replacement}
          <p class="text-xs text-muted-foreground">{name} runs {start === from - 1 ? `week ${start}` : `weeks ${start}–${from - 1}`}, {replacement} {from === end ? `week ${end}` : `weeks ${from}–${end}`}.</p>
        {/if}
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5"><Label>From</Label><OptionSelect value={String(from)} aria-label="From" options={weekOptions(1, total)} onValueChange={(v) => { from = Number(v); if (to < from) to = from; }} /></div>
        <div class="flex flex-col gap-1.5"><Label>To</Label><OptionSelect value={String(to)} aria-label="To" options={weekOptions(from, total)} onValueChange={(v) => (to = Number(v))} /></div>
      </div>
    {/if}
    <Dialog.Footer>
      {#if mode === "some" && weeks}<Button variant="ghost" class="mr-auto" onclick={() => { onrange(null); open = false; }}>Every week</Button>{/if}
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      {#if mode === "replace"}
        <Button disabled={!canReplace} onclick={() => { onreplace(from, replacement.trim()); open = false; }}>Replace from week {from}</Button>
      {:else}
        <Button onclick={() => { onrange(from === 1 && to === total ? null : { from, to }); open = false; }}>Save</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
