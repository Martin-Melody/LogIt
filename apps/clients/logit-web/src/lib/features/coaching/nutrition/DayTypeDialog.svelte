<!-- Canvas Q5: a new day type of your own (high carb, low carb…), on the weekdays you pick. A
     weekday has one type, so picking it here takes it off the other. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import type { PlanDayType } from "@logit/core/domain/CoachNutritionPlan";

  let { open = $bindable(false), dayTypes, onsave }: {
    open?: boolean;
    dayTypes: PlanDayType[];
    onsave: (input: { name: string; weekdays: number[]; copyFrom: string | null }) => void;
  } = $props();

  const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
  let name = $state("");
  let weekdays = $state<number[]>([]);
  let copyFrom = $state<string>("");
  $effect(() => {
    if (!open) return;
    name = "";
    weekdays = [];
    copyFrom = dayTypes[0]?.id ?? "";
  });
  const ownerOf = (w: number) => dayTypes.find((d) => d.weekdays?.includes(w))?.name;
  const moving = $derived(weekdays.map(ownerOf).filter((n): n is string => !!n));
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>New day type</Dialog.Title>
      <Dialog.Description>Its own targets and meals, on the weekdays you pick.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5"><Label for="dt-name">Name</Label>
        <input id="dt-name" bind:value={name} placeholder="High carb" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px]" />
      </div>
      <div class="flex flex-col gap-1.5"><Label>Which days</Label>
        <div class="flex flex-wrap gap-1.5">
          {#each DAYS as [w, label] (w)}
            {@const on = weekdays.includes(w)}
            <Button size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onclick={() => (weekdays = on ? weekdays.filter((x) => x !== w) : [...weekdays, w])}>{label}</Button>
          {/each}
        </div>
        {#if moving.length}<p class="text-xs text-muted-foreground">A weekday has one type: this takes {[...new Set(moving)].join(" and ")} off {weekdays.filter((w) => ownerOf(w)).length === 1 ? "that day" : "those days"}.</p>{/if}
      </div>
      <div class="flex flex-col gap-1.5"><Label>Start from</Label>
        <RadioGroup.Root value={copyFrom} onValueChange={(v) => (copyFrom = v)} class="flex flex-col gap-1.5">
          {#each dayTypes as d (d.id)}
            <label class="flex items-center gap-2 text-[13px]"><RadioGroup.Item value={d.id} aria-label="A copy of {d.name}" />A copy of {d.name}, then change it</label>
          {/each}
          <label class="flex items-center gap-2 text-[13px]"><RadioGroup.Item value="" aria-label="Empty" />Empty</label>
        </RadioGroup.Root>
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={!name.trim() || !weekdays.length} onclick={() => { onsave({ name: name.trim(), weekdays, copyFrom: copyFrom || null }); open = false; }}>Add day type</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
