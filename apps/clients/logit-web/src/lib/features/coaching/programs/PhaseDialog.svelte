<!-- A phase (canvas SP5): weeks with their own progression. "Find your weights" works up to the
     weights that fit and hands them to the next phase; the coach checks them on Today (SP4). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import OptionSelect from "$lib/components/option-select.svelte";
  import type { ProgramPhase } from "@logit/core/domain/CoachProgram";

  let { open = $bindable(false), phase, total, taken, onsave }: {
    open?: boolean;
    /** The phase being changed, or null for a new one. */
    phase: ProgramPhase | null;
    total: number;
    /** Weeks other phases already cover. */
    taken: Set<number>;
    onsave: (p: { name: string; from: number; to: number; findsWeights: boolean }) => void;
  } = $props();

  let kind = $state<"find" | "progression">("find");
  let name = $state("");
  let from = $state(1);
  let to = $state(1);
  $effect(() => {
    if (!open) return;
    kind = phase ? (phase.findsWeights ? "find" : "progression") : "find";
    const free = Array.from({ length: total }, (_, i) => i + 1).find((n) => !taken.has(n)) ?? 1;
    from = phase?.weeks.from ?? free;
    to = phase?.weeks.to ?? free;
    name = phase?.name ?? "";
  });
  const clash = $derived(Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i).some((n) => taken.has(n)));
  const weekOptions = (lo: number) => Array.from({ length: Math.max(0, total - lo + 1) }, (_, i) => ({ value: String(lo + i), label: `Week ${lo + i}` }));
  const KINDS = [
    { id: "find", title: "Find your weights", text: "Works up to a hard set on each lift; the next phase plans from what they find. You check the numbers first." },
    { id: "progression", title: "A progression", text: "Its own progression for these weeks: hypertrophy weeks 1–4, strength weeks 5–8." },
  ] as const;
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{phase ? `Change ${phase.name}` : "Add a phase"}</Dialog.Title>
      <Dialog.Description>Weeks with their own progression. Week types (Deload, Test) still work inside a phase.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3.5">
      <div class="flex flex-col gap-2" role="radiogroup" aria-label="What runs">
        {#each KINDS as k (k.id)}
          <button type="button" role="radio" aria-checked={kind === k.id} onclick={() => (kind = k.id)}
            class="flex flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors {kind === k.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'}">
            <span class="text-[13px] font-semibold">{k.title}</span>
            <span class="text-xs text-muted-foreground">{k.text}</span>
          </button>
        {/each}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5"><Label>From</Label><OptionSelect value={String(from)} aria-label="From" options={weekOptions(1)} onValueChange={(v) => { from = Number(v); if (to < from) to = from; }} /></div>
        <div class="flex flex-col gap-1.5"><Label>To</Label><OptionSelect value={String(to)} aria-label="To" options={weekOptions(from)} onValueChange={(v) => (to = Number(v))} /></div>
      </div>
      <div class="flex flex-col gap-1.5"><Label for="phase-name">Name <span class="font-normal text-muted-foreground">optional</span></Label><Input id="phase-name" bind:value={name} placeholder={kind === "find" ? "Find your weights" : "Strength"} maxlength={40} /></div>
      {#if clash}<p class="text-xs text-destructive">Those weeks overlap another phase.</p>{/if}
      {#if kind === "progression" && !phase}<p class="text-xs text-muted-foreground">You'll pick its progression next.</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={clash} onclick={() => { onsave({ name: name.trim() || (kind === "find" ? "Find your weights" : (from === to ? `Week ${from}` : `Weeks ${from}–${to}`)), from, to, findsWeights: kind === "find" }); open = false; }}>{phase ? "Save" : "Add phase"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
