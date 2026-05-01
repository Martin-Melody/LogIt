<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
  import { advanceRotation, getScheduleMode } from "$lib/usecases/Splits/splitRotation";
  import { selectedDayOverride, clearDayOverride } from "$lib/stores/todaysPlan.store";

  const hasDraft = $derived($currentSession !== null);
  const scheduledDay = $derived($activeSplit ? getTodaySplitDay($activeSplit) : null);

  const selectedDay = $derived(
    $selectedDayOverride?.splitId === $activeSplit?.id
      ? ($activeSplit?.days.find((d) => d.id === $selectedDayOverride?.dayId) ?? scheduledDay)
      : scheduledDay,
  );

  const hasPlan = $derived(!!scheduledDay);

  const startLabel = $derived(
    selectedDay && scheduledDay && selectedDay.id !== scheduledDay.id
      ? `Start Day ${selectedDay.orderIndex + 1}${selectedDay.name ? ` — ${selectedDay.name}` : ""}`
      : "Start today's plan",
  );

  let starting = $state(false);

  async function startPlanned() {
    if (starting) return;
    starting = true;
    if (hasDraft) { await goto("/session/current"); return; }

    const split = $activeSplit;
    const day = selectedDay;

    if (day && split) {
      const mode = getScheduleMode();
      // "original" mode records the scheduled position so tomorrow's plan stays on track;
      // "bump" mode records what you actually did so tomorrow follows from that.
      const dayToRecord = mode === "original" ? scheduledDay : day;
      if (dayToRecord) advanceRotation(split.id, dayToRecord.id);
      clearDayOverride();
      await currentSession.startFromSplitDay(day);
    } else {
      await currentSession.start();
    }

    await goto("/session/current");
  }

  async function startUnplanned() {
    if (starting) return;
    starting = true;
    if (hasDraft) { await goto("/session/current"); return; }
    await currentSession.start();
    await goto("/session/current");
  }

  async function continueWorkout() {
    if (starting) return;
    starting = true;
    await goto("/session/current");
  }
</script>

<Card.Root data-tour="quick-start">
  <Card.Header>
    <Card.Title>{hasDraft ? "Workout in progress" : "Quick start"}</Card.Title>
  </Card.Header>

  <Card.Content class="flex flex-col gap-2">
    {#if hasDraft}
      <Button class="w-full" onclick={() => void continueWorkout()}>
        Continue workout
      </Button>
      <Button variant="outline" class="w-full" onclick={() => void startUnplanned()}>
        Start new
      </Button>
    {:else if hasPlan}
      <Button class="w-full" onclick={() => void startPlanned()}>
        {startLabel}
      </Button>
      <Button variant="outline" class="w-full" onclick={() => void startUnplanned()}>
        Start unplanned
      </Button>
    {:else}
      <Button class="w-full" onclick={() => void startUnplanned()}>
        Start workout
      </Button>
    {/if}
  </Card.Content>
</Card.Root>
