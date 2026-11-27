<!-- Canvas Q5: when a meal is. A clock time, or tied to that day's training session (the start
     time set for each program day on their phone); on a rest day those fall back to a time you
     set here. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { TimeField } from "$lib/components/ui/time-field/index.js";
  import type { MealTime } from "@logit/core/domain/CoachNutritionPlan";

  let { open = $bindable(false), mealName, time, restDayClock, onsave }: {
    open?: boolean;
    mealName: string;
    time: MealTime | undefined;
    restDayClock: string | undefined;
    onsave: (time: MealTime | undefined, restDayClock: string) => void;
  } = $props();

  let kind = $state<"clock" | "before-training" | "after-training" | "none">("none");
  let at = $state("07:30");
  let before = $state(90);
  let within = $state(60);
  let rest = $state("16:30");
  $effect(() => {
    if (!open) return;
    kind = time?.kind ?? "none";
    at = time?.kind === "clock" ? time.at : "07:30";
    before = time?.kind === "before-training" ? time.minutes : 90;
    within = time?.kind === "after-training" ? time.withinMinutes : 60;
    rest = restDayClock ?? "16:30";
  });
  function save() {
    const t: MealTime | undefined = kind === "clock" ? { kind, at } : kind === "before-training" ? { kind, minutes: before } : kind === "after-training" ? { kind, withinMinutes: within } : undefined;
    onsave(t, rest);
    open = false;
  }
  const step = (v: number, d: number, min: number, max: number) => Math.min(max, Math.max(min, v + d));
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>When is "{mealName}"?</Dialog.Title>
      <Dialog.Description>"Training" is their session time: the start time they set for each program day on their phone.</Dialog.Description>
    </Dialog.Header>
    <RadioGroup.Root value={kind} onValueChange={(v) => (kind = v as typeof kind)} class="flex flex-col gap-2">
      <label class="flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13px] {kind === 'clock' ? 'border-primary bg-primary/5' : 'border-border'}">
        <RadioGroup.Item value="clock" aria-label="At a time" /><span class="flex-1">At a time</span>
        <TimeField bind:value={at} aria-label="Meal time" disabled={kind !== "clock"} />
      </label>
      <label class="flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13px] {kind === 'before-training' ? 'border-primary bg-primary/5' : 'border-border'}">
        <RadioGroup.Item value="before-training" aria-label="Before training" /><span class="flex-1">Before training</span>
        <span class="flex items-center gap-1.5">
          <Button variant="outline" size="icon" class="size-8" aria-label="15 min less" disabled={kind !== "before-training"} onclick={() => (before = step(before, -15, 15, 240))}>−</Button>
          <span class="w-14 text-center tabular-nums">{before} min</span>
          <Button variant="outline" size="icon" class="size-8" aria-label="15 min more" disabled={kind !== "before-training"} onclick={() => (before = step(before, 15, 15, 240))}>+</Button>
        </span>
      </label>
      <label class="flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13px] {kind === 'after-training' ? 'border-primary bg-primary/5' : 'border-border'}">
        <RadioGroup.Item value="after-training" aria-label="After training" /><span class="flex-1">After training, within</span>
        <span class="flex items-center gap-1.5">
          <Button variant="outline" size="icon" class="size-8" aria-label="15 min less" disabled={kind !== "after-training"} onclick={() => (within = step(within, -15, 15, 180))}>−</Button>
          <span class="w-14 text-center tabular-nums">{within} min</span>
          <Button variant="outline" size="icon" class="size-8" aria-label="15 min more" disabled={kind !== "after-training"} onclick={() => (within = step(within, 15, 15, 180))}>+</Button>
        </span>
      </label>
      <label class="flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] {kind === 'none' ? 'border-primary bg-primary/5' : 'border-border'}">
        <RadioGroup.Item value="none" aria-label="No set time" /><span>No set time</span>
      </label>
    </RadioGroup.Root>
    {#if kind === "before-training" || kind === "after-training"}
      <div class="flex items-center justify-between gap-3 rounded-[10px] bg-muted px-3 py-2.5 text-[13px]">
        <span>On a rest day, "training" is at</span>
        <TimeField bind:value={rest} aria-label="Rest-day time" />
      </div>
      <p class="text-xs text-muted-foreground">This plan's rest-day time, for every before/after meal.</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={save}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
