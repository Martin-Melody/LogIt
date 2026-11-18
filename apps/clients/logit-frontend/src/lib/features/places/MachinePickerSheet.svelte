<!-- "Which machine?" for an exercise at a place (design canvas G2), opened from the machine chip
     on the exercise card. The pick is remembered for this exercise at this place. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { goto } from "$app/navigation";
  import type { Place, PlaceMachine } from "@logit/core/domain/place";
  import { placesStore } from "./places.svelte";

  let {
    open,
    place,
    exerciseId,
    exerciseName,
    machines,
    currentId,
    onOpenChange,
    onPick,
  }: {
    open: boolean;
    place: Place;
    exerciseId: string;
    exerciseName: string;
    machines: PlaceMachine[];
    currentId: string | null;
    onOpenChange: (v: boolean) => void;
    onPick: (machine: PlaceMachine) => void;
  } = $props();

  function describe(m: PlaceMachine): string {
    const u = m.unit === "lbs" ? "lb" : "kg";
    if (m.weights?.kind === "stack" && m.weights.values.length) return `Stack ${m.weights.values[0]}–${m.weights.values.at(-1)} ${u}`;
    if (m.weights?.kind === "linear") return `Stack ${m.weights.min}–${m.weights.max ?? "?"} ${u}`;
    if (m.loading === "plates") return "Plates you load";
    if (m.loading === "assisted") return "Assisted";
    return "No weight to set";
  }

  function pick(m: PlaceMachine) {
    const p = placesStore.byId(place.id);
    if (p) placesStore.save({ ...p, choices: { ...(p.choices ?? {}), [exerciseId]: m.id } });
    onPick(m);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3 p-4 sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Which machine?</Dialog.Title>
      <Dialog.Description>{exerciseName} at {place.name}</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-2">
      {#each machines as m (m.id)}
        <button type="button" onclick={() => pick(m)} aria-pressed={m.id === currentId}
          class="flex min-h-14 flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left {m.id === currentId ? 'border-2 border-foreground' : 'border-border'}">
          <span class="text-sm font-semibold">{m.name}{#if m.status === "out"} <span class="ml-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">Out of order</span>{/if}</span>
          <span class="text-[13px] text-muted-foreground">{describe(m)}</span>
        </button>
      {:else}
        <p class="text-sm text-muted-foreground">No machines at {place.name} are set up for {exerciseName} yet.</p>
      {/each}
    </div>
    <button type="button" class="min-h-11 text-sm font-semibold" onclick={() => { onOpenChange(false); void goto(`/settings/places/${place.id}/machine/new`); }}>
      Not here? Add a machine
    </button>
    <p class="text-xs text-muted-foreground">Remembered for {exerciseName} at {place.name}. Weights are rounded to the machine's settings.</p>
  </Dialog.Content>
</Dialog.Root>
