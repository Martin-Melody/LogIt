<script lang="ts">
  import { back } from "$lib/navigation";
  // Settings › Your places › a machine: the machine editor as a page (MachineEditor).
  import { page } from "$app/state";
  import MachineEditor from "$lib/features/places/MachineEditor.svelte";
  import { placesStore } from "$lib/features/places/places.svelte";

  const placeId = $derived(page.params.id ?? "");
  const machineId = $derived(page.params.machineId ?? "new");
  const place = $derived(placesStore.byId(placeId));
</script>

<div class="mx-auto flex min-h-screen w-full max-w-sm flex-col gap-4 bg-background px-6 pb-10 pt-10 text-foreground">
  {#if !place}
    <p class="text-sm text-muted-foreground">This place isn't on this phone.</p>
  {:else}
    {#key `${placeId}/${machineId}`}
      <MachineEditor {place} machineId={machineId === "new" ? null : machineId} backLabel={place.name}
        onDone={() => back(`/settings/places/${placeId}`)} onBack={() => back(`/settings/places/${placeId}`)} />
    {/key}
  {/if}
</div>
