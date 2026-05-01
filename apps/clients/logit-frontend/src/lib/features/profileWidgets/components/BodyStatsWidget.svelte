<script lang="ts">
  import { Pencil, Check, X } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";

  let editing = $state(false);
  const draft = $state({ height: "", heightUnit: "cm" as "cm" | "in", weight: "", weightUnit: "kg" as "kg" | "lbs" });

  function openEdit() {
    draft.height = $profile.height !== null ? String($profile.height) : "";
    draft.heightUnit = $profile.heightUnit;
    draft.weight = $profile.weight !== null ? String($profile.weight) : "";
    draft.weightUnit = $profile.weightUnit;
    editing = true;
  }

  function save() {
    const h = Number(draft.height);
    const w = Number(draft.weight);
    profile.save({
      height: Number.isFinite(h) && h > 0 ? h : null,
      heightUnit: draft.heightUnit,
      weight: Number.isFinite(w) && w > 0 ? w : null,
      weightUnit: draft.weightUnit,
    });
    editing = false;
  }

  function fmt(val: number | null, unit: string) {
    return val !== null ? `${val} ${unit}` : "—";
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm">Body Stats</Card.Title>
    {#if !editing}
      <Card.Action>
        <button
          type="button"
          class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onclick={openEdit}
        >
          <Pencil class="h-3 w-3" /> Edit
        </button>
      </Card.Action>
    {/if}
  </Card.Header>

  <Card.Content>
    {#if editing}
      <div class="flex flex-col gap-3">
        <div class="flex gap-2 items-end">
          <div class="flex flex-col gap-1 flex-1">
            <label class="text-xs text-muted-foreground" for="bs-height">Height</label>
            <input id="bs-height" type="number" min="0" inputmode="decimal"
              class="w-full rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={draft.height} />
          </div>
          <div class="flex overflow-hidden rounded border text-xs mb-0.5">
            <button type="button" class="px-2.5 py-1.5 {draft.heightUnit === 'cm' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.heightUnit = "cm")}>cm</button>
            <button type="button" class="px-2.5 py-1.5 {draft.heightUnit === 'in' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.heightUnit = "in")}>in</button>
          </div>
        </div>
        <div class="flex gap-2 items-end">
          <div class="flex flex-col gap-1 flex-1">
            <label class="text-xs text-muted-foreground" for="bs-weight">Weight</label>
            <input id="bs-weight" type="number" min="0" inputmode="decimal"
              class="w-full rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={draft.weight} />
          </div>
          <div class="flex overflow-hidden rounded border text-xs mb-0.5">
            <button type="button" class="px-2.5 py-1.5 {draft.weightUnit === 'kg' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.weightUnit = "kg")}>kg</button>
            <button type="button" class="px-2.5 py-1.5 {draft.weightUnit === 'lbs' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}" onclick={() => (draft.weightUnit = "lbs")}>lbs</button>
          </div>
        </div>
        <div class="flex gap-2">
          <Button size="sm" onclick={save}><Check class="h-3.5 w-3.5 mr-1" /> Save</Button>
          <Button size="sm" variant="outline" onclick={() => (editing = false)}><X class="h-3.5 w-3.5 mr-1" /> Cancel</Button>
        </div>
      </div>
    {:else}
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt class="text-muted-foreground">Height</dt>
        <dd class="font-medium">{fmt($profile.height, $profile.heightUnit)}</dd>
        <dt class="text-muted-foreground">Weight</dt>
        <dd class="font-medium">{fmt($profile.weight, $profile.weightUnit)}</dd>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>
