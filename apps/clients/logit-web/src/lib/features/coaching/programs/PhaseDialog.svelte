<!-- A phase (canvas SP5): weeks with their own progression. "Find your weights" works up to the
     weights that fit and hands them to the next phase; the coach checks them on Today (SP4). -->
<script lang="ts" module>
  import type { ProgramRule as Rule } from "@logit/core/domain/CoachProgram";
  /** What a saved phase brings: LogIt's Find your weights runs the Weight finder; a pack its own parts. */
  export type PhaseChoice = { name: string; from: number; to: number; findsWeights: boolean; blockPluginId?: string; pack?: { id: string; name: string }; rule?: Rule };
</script>

<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { FIND_YOUR_WEIGHTS_PACK, WEIGHT_FINDER_ID, type ProgramPhase, type ProgramRule } from "@logit/core/domain/CoachProgram";
  import type { PhasePack } from "@logit/core/plugins/phasePack";

  let { open = $bindable(false), phase, total, taken, packs = [], onsave }: {
    open?: boolean;
    /** The phase being changed, or null for a new one. */
    phase: ProgramPhase | null;
    total: number;
    /** Weeks other phases already cover. */
    taken: Set<number>;
    /** Starting phases from installed phase packs (canvas SP8). */
    packs?: (PhasePack & { name: string; description: string })[];
    onsave: (p: PhaseChoice) => void;
  } = $props();

  let kind = $state<string>("find");
  let name = $state("");
  let from = $state(1);
  let to = $state(1);
  $effect(() => {
    if (!open) return;
    kind = phase ? (phase.pack && phase.pack.id !== FIND_YOUR_WEIGHTS_PACK.id ? `pack:${phase.pack.id}` : phase.findsWeights ? "find" : "progression") : "find";
    const free = Array.from({ length: total }, (_, i) => i + 1).find((n) => !taken.has(n)) ?? 1;
    from = phase?.weeks.from ?? free;
    to = phase?.weeks.to ?? free;
    if (!phase) to = Math.min(total, from + (packs.find((p) => `pack:${p.pluginId}` === kind)?.phase.weeks ?? 1) - 1);
    name = phase?.name ?? "";
  });
  const clash = $derived(Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i).some((n) => taken.has(n)));
  const weekOptions = (lo: number) => Array.from({ length: Math.max(0, total - lo + 1) }, (_, i) => ({ value: String(lo + i), label: `Week ${lo + i}` }));
  const KINDS = $derived([
    { id: "find", title: "Find your weights", text: "LogIt's Weight finder on each lift: a jump at a time until they could only do 1 or 2 more. The next phase plans from what they find; you check the numbers first." },
    ...packs.map((p) => ({ id: `pack:${p.pluginId}`, title: p.phase.name, text: `${p.description} From ${p.name}.` })),
    { id: "progression", title: "A progression", text: "Its own progression for these weeks: hypertrophy weeks 1–4, strength weeks 5–8." },
  ]);
  function choice(): PhaseChoice {
    const pack = packs.find((p) => `pack:${p.pluginId}` === kind);
    const fallback = from === to ? `Week ${from}` : `Weeks ${from}–${to}`;
    if (kind === "find") return { name: name.trim() || "Find your weights", from, to, findsWeights: true, blockPluginId: WEIGHT_FINDER_ID, pack: FIND_YOUR_WEIGHTS_PACK };
    if (pack) return {
      name: name.trim() || pack.phase.name, from, to, findsWeights: pack.phase.findsWeights,
      ...(pack.phase.block ? { blockPluginId: pack.phase.block } : {}),
      ...(pack.phase.progression ? { rule: { kind: "plugin", pluginId: pack.phase.progression, name: pack.phase.name } as ProgramRule } : {}),
      pack: { id: pack.pluginId, name: pack.name },
    };
    return { name: name.trim() || fallback, from, to, findsWeights: false };
  }
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
      <Button disabled={clash} onclick={() => { onsave(choice()); open = false; }}>{phase ? "Save" : "Add phase"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
