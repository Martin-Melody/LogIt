<!-- A superset's settings (canvas PB2): the same fields as Edit superset / Edit circuit in the
     workout, so whatever a client can set there, the coach can plan here. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import OptionSelect from "$lib/components/option-select.svelte";
  import type { ProgramGroup } from "@logit/core/domain/CoachProgram";
  import { parseRestText, restText } from "@logit/core/domain/CoachProgram";

  let { open = $bindable(false), group, fallback, onsave }: { open?: boolean; group: ProgramGroup; fallback: string; onsave: (patch: Partial<Omit<ProgramGroup, "id">>) => void } = $props();

  let name = $state("");
  let kind = $state<"superset" | "circuit">("superset");
  let between = $state("");
  let after = $state("");
  let bad = $state(false);
  $effect(() => {
    if (!open) return;
    name = group.name ?? "";
    kind = group.kind ?? "superset";
    between = group.memberRestSec != null ? restText(group.memberRestSec) : "";
    after = group.roundRestSec != null ? restText(group.roundRestSec) : "";
    bad = false;
  });
  function save() {
    const b = between.trim() ? parseRestText(between) : undefined;
    const a = after.trim() ? parseRestText(after) : undefined;
    if (b === null || a === null) { bad = true; return; }
    onsave({ name: name.trim() || undefined, kind, memberRestSec: b, roundRestSec: a });
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{name.trim() || fallback}</Dialog.Title>
      <Dialog.Description>{kind === "circuit" ? "Runs with the circuit timer: each exercise, then the next, round after round." : "Back to back with no timer between exercises: A, B, C, then rest."}</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3.5">
      <div class="flex flex-col gap-1.5"><Label for="grp-name">Name <span class="font-normal text-muted-foreground">optional</span></Label><Input id="grp-name" bind:value={name} placeholder={fallback} maxlength={40} /></div>
      <div class="flex flex-col gap-1.5"><Label>Type</Label>
        <OptionSelect value={kind} aria-label="Type" options={[{ value: "superset", label: "Superset" }, { value: "circuit", label: "Circuit" }]} onValueChange={(v) => (kind = v as typeof kind)} />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5"><Label for="grp-between">Rest between exercises</Label><Input id="grp-between" bind:value={between} placeholder={kind === "circuit" ? "0:15" : "None"} /></div>
        <div class="flex flex-col gap-1.5"><Label for="grp-after">Rest after the round</Label><Input id="grp-after" bind:value={after} placeholder="2:00" /></div>
      </div>
      {#if bad}<p class="text-xs text-destructive">Use 1:30 or 90 for rests.</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={save}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
