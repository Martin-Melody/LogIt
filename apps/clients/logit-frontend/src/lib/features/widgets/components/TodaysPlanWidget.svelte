<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
  import { selectedDayOverride, selectDayOverride, clearDayOverride } from "$lib/stores/todaysPlan.store";

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

  // Reset override when the active split changes
  $effect(() => {
    const splitId = $activeSplit?.id;
    if ($selectedDayOverride && $selectedDayOverride.splitId !== splitId) clearDayOverride();
  });

  function prev() {
    if (!$activeSplit || sortedDays.length < 2) return;
    const idx = selectedIdx < 0 ? 0 : selectedIdx;
    const newIdx = (idx - 1 + sortedDays.length) % sortedDays.length;
    selectDayOverride($activeSplit.id, sortedDays[newIdx]!.id);
  }

  function next() {
    if (!$activeSplit || sortedDays.length < 2) return;
    const idx = selectedIdx < 0 ? 0 : selectedIdx;
    const newIdx = (idx + 1) % sortedDays.length;
    selectDayOverride($activeSplit.id, sortedDays[newIdx]!.id);
  }

  function dayLabel(idx: number, name?: string): string {
    return name ? `Day ${idx + 1} — ${name}` : `Day ${idx + 1}`;
  }

  function edit() {
    if ($activeSplit) void goto(`/splits/${$activeSplit.id}`);
    else void goto("/splits");
  }
</script>

<Card.Root data-tour="todays-plan">
  <Card.Header>
    <!-- Title row — short fixed text on left, controls on right, never overflows -->
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

    <!-- Day label row — full width, free to truncate without competing with controls -->
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

    <!-- Day position dots -->
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
  </Card.Content>
</Card.Root>
