<!-- Picking a set's weight from what's real (design canvas X2/X3): a machine's own settings in
     the units printed on it, a barbell's plates per side, or the dumbbells at this place.
     Opened by tapping the weight on a set; typing is still there ("Type a weight"). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Minus, Plus } from "lucide-svelte";
  import { reveal } from "$lib/transitions";
  import type { WeightSource } from "./weightSource";
  import { machineUnit, machineWeightsKg } from "@logit/core/domain/machine";
  import { platesPerSide } from "@logit/core/domain/plates";
  import { toDisplayWeight, fromDisplayWeight, roundDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";

  let {
    open,
    source,
    title,
    weightKg,
    plannedKg = null,
    lastKg = null,
    unit,
    onOpenChange,
    onPick,
  }: {
    open: boolean;
    source: WeightSource;
    title: string;
    weightKg: number;
    plannedKg?: number | null;
    lastKg?: number | null;
    unit: WeightUnit;
    onOpenChange: (v: boolean) => void;
    onPick: (kg: number) => void;
  } = $props();

  let picked = $state(0);
  let typing = $state(false);
  let typed = $state("");
  let listEl = $state<HTMLElement | null>(null);

  $effect(() => {
    if (open) {
      const start = weightKg || plannedKg || lastKg || 0;
      // A bar can't weigh less than the bar itself.
      picked = source.kind === "bar" ? Math.max(source.barbell.barKg, start) : start;
      typing = false;
      typed = "";
      queueMicrotask(() => listEl?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "center" }));
    }
  });

  const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.01;
  const show = (kg: number, u: WeightUnit = unit) => trimWeight(roundDisplayWeight(toDisplayWeight(kg, u), u));

  /** The rungs to pick from (kg, ascending) for a machine or dumbbells. */
  const rungs = $derived(
    source.kind === "machine" ? (machineWeightsKg(source.machine) ?? []) : source.kind === "dumbbells" ? source.weightsKg : [],
  );
  const machineU = $derived(source.kind === "machine" ? machineUnit(source.machine) : unit);

  // Barbell: − and + move by the smallest pair of plates.
  const barStep = $derived(source.kind === "bar" ? 2 * Math.min(...source.barbell.platesKg.filter((p) => p > 0), 2.5) : 2.5);
  const loaded = $derived(source.kind === "bar" ? platesPerSide(picked, source.barbell) : null);

  function snapToRung(kg: number): number {
    if (rungs.length === 0) return kg;
    return rungs.reduce((best, r) => (Math.abs(r - kg) < Math.abs(best - kg) ? r : best), rungs[0]!);
  }

  function useTyped() {
    const n = Number(typed);
    if (!Number.isFinite(n) || n < 0) return;
    picked = fromDisplayWeight(n, unit);
    typing = false;
  }

  function done() {
    onPick(source.kind === "bar" ? (loaded?.achievableKg ?? picked) : rungs.length ? snapToRung(picked) : picked);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="flex flex-col gap-3 bg-card">
    <Dialog.Header>
      <Dialog.Title class="text-sm font-semibold text-muted-foreground">{title}{source.placeName ? `, ${source.placeName}` : ""}</Dialog.Title>
      <Dialog.Description class="sr-only">Pick the weight for this set</Dialog.Description>
    </Dialog.Header>

    <div class="flex items-baseline gap-2" aria-live="polite">
      <span class="text-[40px] font-bold leading-none tabular-nums">{show(source.kind === "bar" ? (loaded?.achievableKg ?? picked) : picked)}</span>
      <span class="text-lg font-semibold">{unit === "lbs" ? "lb" : "kg"}</span>
      {#if source.kind === "machine" && machineU !== unit}
        <span class="text-[15px] text-muted-foreground">{show(picked, machineU)} {machineU === "lbs" ? "lb" : "kg"} on the stack</span>
      {/if}
    </div>

    {#if typing}
      <form class="flex gap-2" in:reveal onsubmit={(e) => { e.preventDefault(); useTyped(); }}>
        <label for="wp-typed" class="sr-only">Weight ({unit})</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="wp-typed" type="number" inputmode="decimal" bind:value={typed} autofocus class="h-12 min-w-0 flex-1 rounded-lg border bg-background px-3 text-lg font-semibold" />
        <Button type="submit" class="h-12">Set</Button>
      </form>
    {:else if source.kind === "bar"}
      <div class="grid grid-cols-[56px_1fr_56px] items-center gap-2.5">
        <button type="button" aria-label="Lighter by {show(barStep)}" class="flex h-14 items-center justify-center rounded-xl border border-border" onclick={() => (picked = Math.max(source.barbell.barKg, picked - barStep))}><Minus class="h-5 w-5" /></button>
        <p class="text-center text-[13px] text-muted-foreground">Moves by the smallest pair you have: {show(barStep)} {unit === "lbs" ? "lb" : "kg"}</p>
        <button type="button" aria-label="Heavier by {show(barStep)}" class="flex h-14 items-center justify-center rounded-xl border border-border" onclick={() => (picked = picked + barStep)}><Plus class="h-5 w-5" /></button>
      </div>
      {#if loaded}
        <div class="flex items-center justify-center gap-1 py-2" role="img" aria-label="On each side: {loaded.perSide.join(', ') || 'nothing'} kg on a {source.barbell.barKg} kg bar">
          {#each [...loaded.perSide].reverse() as p, i (i)}
            <span class="flex w-6 items-center justify-center rounded-sm bg-foreground text-[10px] font-semibold text-background" style="height: {Math.max(28, Math.min(96, p * 3.6))}px">{p}</span>
          {/each}
          <span class="h-3 w-16 rounded-sm bg-muted-foreground/60"></span>
          {#each loaded.perSide as p, i (i)}
            <span class="flex w-6 items-center justify-center rounded-sm bg-foreground text-[10px] font-semibold text-background" style="height: {Math.max(28, Math.min(96, p * 3.6))}px">{p}</span>
          {/each}
        </div>
        <p class="text-center text-[15px] font-semibold">{loaded.perSide.length ? `Each side: ${loaded.perSide.join(" + ")}` : `Just the ${source.barbell.barKg} kg bar`}</p>
        {#if loaded.shortfallKg > 0.01}<p class="text-center text-xs text-muted-foreground">Closest your plates can make.</p>{/if}
      {/if}
    {:else}
      <div bind:this={listEl} role="listbox" aria-label="Weights you can use" class="flex max-h-[44svh] flex-col overflow-y-auto rounded-xl border border-border">
        {#each rungs as r (r)}
          {@const on = near(snapToRung(picked), r)}
          <button type="button" role="option" aria-selected={on} onclick={() => (picked = r)}
            class="flex min-h-12 shrink-0 items-center justify-between border-b border-border/60 px-4 text-left last:border-b-0 {on ? 'bg-primary text-primary-foreground' : ''}">
            <span class="text-base {on ? 'font-bold' : ''} tabular-nums">{show(r)} {unit === "lbs" ? "lb" : "kg"}</span>
            <span class="text-[13px] {on ? '' : 'text-muted-foreground'}">
              {#if source.kind === "machine" && machineU !== unit}{show(r, machineU)} {machineU === "lbs" ? "lb" : "kg"}{/if}
              {#if near(plannedKg, r)} · planned{/if}{#if near(lastKg, r)} · last time{/if}
            </span>
          </button>
        {:else}
          <p class="px-4 py-3 text-sm text-muted-foreground">No settings saved for this yet.</p>
        {/each}
      </div>
    {/if}

    {#if (plannedKg || lastKg) && !typing}
      <div class="flex flex-wrap justify-center gap-2 text-[13px]">
        {#if lastKg}<span class="rounded-full bg-muted px-2.5 py-1">Last time {show(lastKg)}</span>{/if}
        {#if plannedKg}<span class="rounded-full bg-info/10 px-2.5 py-1 text-info">Planned {show(plannedKg)}</span>{/if}
      </div>
    {/if}

    <Button class="h-12 text-[15px]" onclick={done}>Use {show(source.kind === "bar" ? (loaded?.achievableKg ?? picked) : rungs.length ? snapToRung(picked) : picked)} {unit === "lbs" ? "lb" : "kg"}</Button>
    {#if !typing}
      <Button variant="outline" class="h-11" onclick={() => { typing = true; typed = show(picked); }}>Type a weight</Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
