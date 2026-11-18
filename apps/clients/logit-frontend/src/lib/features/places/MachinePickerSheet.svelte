<!-- "Which machine?" for an exercise at a place (design canvas G2, M1), opened from the machine
     chip on the exercise card: the only machine door in a workout. Tap a row to use it (the
     sets not done yet move onto it), the pencil to fix it, or add one here. The pick is
     remembered for this exercise at this place. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Pencil, Plus } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Place, PlaceMachine } from "@logit/core/domain/place";
  import { placesStore } from "./places.svelte";

  let {
    open,
    place,
    exerciseId,
    exerciseName,
    machines,
    currentId,
    lastTimeOn = () => null,
    onOpenChange,
    onPick,
    onEdit,
    onAdd,
    onChangePlace,
  }: {
    open: boolean;
    place: Place;
    exerciseId: string;
    exerciseName: string;
    machines: PlaceMachine[];
    currentId: string | null;
    /** "59 × 10" the last time on that machine, if ever. */
    lastTimeOn?: (machineId: string) => string | null;
    onOpenChange: (v: boolean) => void;
    onPick: (machine: PlaceMachine) => void;
    onEdit: (machine: PlaceMachine) => void;
    onAdd: () => void;
    /** "Not at Northside today?": opens "Where are you today?". Absent with only one place. */
    onChangePlace?: () => void;
  } = $props();

  function describe(m: PlaceMachine): string {
    const u = m.unit === "lbs" ? "lb" : "kg";
    const last = lastTimeOn(m.id);
    let what = "No weight to set";
    if (m.weights?.kind === "stack" && m.weights.values.length) what = `Stack ${m.weights.values[0]}–${m.weights.values.at(-1)} ${u}`;
    else if (m.weights?.kind === "linear") what = `Stack ${m.weights.min}–${m.weights.max ?? "?"} ${u}`;
    else if (m.loading === "plates") what = "Plates you load";
    else if (m.loading === "assisted") what = "Assisted";
    return `${what} · ${last ? `last time ${last}` : "not used yet"}`;
  }

  function pick(m: PlaceMachine) {
    const p = placesStore.byId(place.id);
    if (p && m.id !== currentId) placesStore.save({ ...p, choices: { ...(p.choices ?? {}), [exerciseId]: m.id } });
    if (m.id !== currentId) onPick(m);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="flex flex-col gap-3">
    <Dialog.Header>
      <Dialog.Title>Which machine?</Dialog.Title>
      <Dialog.Description>{exerciseName} at {place.name}</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-2">
      {#each machines as m (m.id)}
        <div class="flex items-stretch overflow-hidden rounded-xl {m.id === currentId ? 'border-2 border-foreground' : 'border border-border'}">
          <button type="button" onclick={() => pick(m)} aria-pressed={m.id === currentId}
            class="flex min-h-14 flex-1 flex-col items-start justify-center px-3.5 py-2.5 text-left">
            <span class="flex items-center gap-1.5 text-sm font-semibold">{m.name}{#if m.status === "out"}<span class="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">Out of order</span>{/if}</span>
            <span class="text-[13px] text-muted-foreground">{describe(m)}</span>
          </button>
          <button type="button" aria-label="Change {m.name}" onclick={() => onEdit(m)}
            class="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground">
            <Pencil class="h-4 w-4" />
          </button>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">No machines at {place.name} are set up for {exerciseName} yet.</p>
      {/each}
      <button type="button" onclick={onAdd}
        class="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-muted-foreground/50 px-3.5 text-sm font-semibold">
        <Plus class="h-4 w-4" /> Add a machine at {place.name}
      </button>
    </div>
    <p class="text-[13px] text-muted-foreground">The sets you haven't done yet move to the one you pick. Next time at {place.name} it starts there.</p>
    {#if onChangePlace}
      <Button variant="outline" class="h-11" onclick={() => { onOpenChange(false); onChangePlace?.(); }}>
        Not at {place.name} today?
      </Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
