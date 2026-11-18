<!-- The machine editor over a workout (design canvas M2): add or fix a machine without leaving
     the workout. Closing it, or saving, lands back on the same exercise. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { Place, PlaceMachine } from "@logit/core/domain/place";
  import MachineEditor from "./MachineEditor.svelte";

  let {
    open,
    place,
    machineId = null,
    forExercise = null,
    onOpenChange,
    onSaved,
  }: {
    open: boolean;
    place: Place | null;
    machineId?: string | null;
    forExercise?: { id: string; name: string } | null;
    onOpenChange: (v: boolean) => void;
    onSaved: (result: { machine: PlaceMachine; place: Place; createdPlace: boolean }) => void;
  } = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content
    class="grid-cols-[minmax(0,1fr)] top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl h-[92dvh] overflow-y-auto
      px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]
      data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100
      data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10
      sm:left-[50%] sm:max-w-[420px] sm:translate-x-[-50%]"
  >
    <Dialog.Title class="sr-only">{machineId ? "Change machine" : "Add a machine"}</Dialog.Title>
    <Dialog.Description class="sr-only">{place ? `At ${place.name}` : "Saved to My gym"}</Dialog.Description>
    {#if open}
      {#key `${place?.id ?? "none"}/${machineId ?? "new"}`}
        <MachineEditor
          {place}
          {machineId}
          {forExercise}
          backLabel="Back to the workout"
          onBack={() => onOpenChange(false)}
          onDone={(r) => { onSaved(r); onOpenChange(false); }}
        />
      {/key}
    {/if}
  </Dialog.Content>
</Dialog.Root>
