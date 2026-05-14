<script lang="ts">
  import { goto } from "$app/navigation";
  import { fly } from "svelte/transition";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
  import { selectedDayOverride, selectDayOverride, clearDayOverride } from "$lib/stores/todaysPlan.store";
  import { createSwipeHandlers, animateHeight } from "$lib/swipe";

  const sortedDays = $derived(
    $activeSplit ? [...$activeSplit.days].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  const scheduledDay = $derived($activeSplit ? getTodaySplitDay($activeSplit) : null);

  const selectedDay = $derived(
    $selectedDayOverride?.splitId === $activeSplit?.id
      ? (sortedDays.find((d) => d.id === $selectedDayOverride?.dayId) ?? scheduledDay)
      : scheduledDay,
  );

  const selectedIdx = $derived(
    selectedDay ? sortedDays.findIndex((d) => d.id === selectedDay.id) : -1,
  );

  const isScheduled = $derived(
    !!(selectedDay && scheduledDay && selectedDay.id === scheduledDay.id),
  );

  const blocks = $derived(
    selectedDay ? [...selectedDay.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  $effect(() => {
    const splitId = $activeSplit?.id;
    if ($selectedDayOverride && $selectedDayOverride.splitId !== splitId) clearDayOverride();
  });

  let slideDir = $state(1);

  function prev() {
    slideDir = -1;
    if (!$activeSplit || sortedDays.length < 2) return;
    const idx = selectedIdx < 0 ? 0 : selectedIdx;
    selectDayOverride($activeSplit.id, sortedDays[(idx - 1 + sortedDays.length) % sortedDays.length]!.id);
  }

  function next() {
    slideDir = 1;
    if (!$activeSplit || sortedDays.length < 2) return;
    const idx = selectedIdx < 0 ? 0 : selectedIdx;
    selectDayOverride($activeSplit.id, sortedDays[(idx + 1) % sortedDays.length]!.id);
  }

  function dayLabel(idx: number, name?: string): string {
    return name ? `Day ${idx + 1} — ${name}` : `Day ${idx + 1}`;
  }

  function edit() {
    if ($activeSplit) void goto(`/splits/${$activeSplit.id}`);
    else void goto("/splits");
  }

  const swipe = createSwipeHandlers(next, prev);
</script>

<Card.Root data-tour="todays-plan" {...swipe}>
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <Card.Title>Today's plan</Card.Title>
      <div class="flex items-center gap-0.5 shrink-0">
        {#if sortedDays.length > 1}
          <button
            type="button"
            class="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            onclick={prev}
            aria-label="Previous day"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            onclick={next}
            aria-label="Next day"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        {/if}
        <Button variant="ghost" class="h-7 px-2 text-xs" onclick={edit}>Edit</Button>
      </div>
    </div>

    {#if selectedDay}
      <div class="flex items-center gap-1.5 mt-0.5 overflow-hidden">
        <Card.Description class="truncate min-w-0">
          {dayLabel(selectedDay.orderIndex, selectedDay.name)}
        </Card.Description>
        {#if isScheduled}
          <span class="text-xs text-primary font-medium shrink-0">Scheduled</span>
        {/if}
      </div>
    {/if}

    {#if sortedDays.length > 1}
      <div class="flex items-center gap-1 pt-1">
        {#each sortedDays as day, i (day.id)}
          <div
            class="h-1.5 rounded-full transition-all {i === selectedIdx ? 'w-4 bg-primary' : 'w-1.5 bg-border'}"
          ></div>
        {/each}
      </div>
    {/if}
  </Card.Header>

  <Card.Content>
    <div class="overflow-hidden" use:animateHeight>
    {#key selectedIdx}
      <div in:fly={{ x: slideDir * 16, duration: 200, opacity: 0 }}>
        {#if blocks.length === 0}
          <p class="text-sm text-muted-foreground">
            {#if $activeSplit}
              No exercises planned for this day.
            {:else}
              Set up a split to see your plan here.
            {/if}
          </p>
        {:else}
          <ol class="flex flex-col gap-1">
            {#each blocks.slice(0, 7) as block, i (block.id)}
              <li class="text-sm flex items-center gap-2">
                <span class="text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                <span>{block.type === "strength" ? block.exerciseName : block.activityName}</span>
              </li>
            {/each}
            {#if blocks.length > 7}
              <li class="text-xs text-muted-foreground pl-6">+{blocks.length - 7} more</li>
            {/if}
          </ol>
        {/if}
      </div>
    {/key}
    </div>
  </Card.Content>
</Card.Root>
