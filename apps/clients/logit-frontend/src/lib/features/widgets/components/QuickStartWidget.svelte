<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
  import { advanceRotation } from "$lib/usecases/Splits/splitRotation";

  const hasDraft = $derived($currentSession !== null);
  const todayDay = $derived($activeSplit ? getTodaySplitDay($activeSplit) : null);
  const hasPlan = $derived(!!todayDay);

  let starting = $state(false);

  async function startPlanned() {
    if (starting) return;
    starting = true;
    if (hasDraft) { await goto("/session/current"); return; }

    const day = todayDay;
    if (day && $activeSplit) {
      // Record rotation before starting so getTodaySplitDay returns the correct
      // next day immediately after this session begins.
      advanceRotation($activeSplit.id, day.id);
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
    <div class="flex items-center justify-between">
      <Card.Title>{hasDraft ? "Workout in progress" : "Quick start"}</Card.Title>
    </div>
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
        Start today's plan
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
