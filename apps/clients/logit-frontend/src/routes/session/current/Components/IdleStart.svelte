<script lang="ts">
  import { onMount } from "svelte";
  import { Dumbbell, Plus, RotateCcw } from "lucide-svelte";
  import { toast } from "$lib/components/ui/sonner/index";
  import { Button } from "$lib/components/ui/button";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { popIn } from "$lib/transitions";
  import {
    plannedDay,
    splitDayLabel,
    startEmptyWorkout,
    startPlannedWorkout,
  } from "$lib/features/session/startWorkout";

  // Shown on /session/current when no workout is running, so opening the page (from the
  // nav, or by swiping onto it) never starts a workout by itself.

  let busy = $state(false);
  let hasPreviousSession = $state(false);

  const today = $derived(plannedDay($activeSplit));

  onMount(() => {
    void getWorkoutRepo()
      .listRecentSessions({ limit: 1 })
      .then((s) => (hasPreviousSession = s.length > 0))
      .catch(() => {});
  });

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the workout");
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col items-center gap-5 px-6 py-12 text-center" in:popIn={{ duration: 200 }}>
  <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
    <Dumbbell size={26} />
  </div>

  {#if $activeSplit && today.day}
    <div class="flex flex-col gap-1">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">{$activeSplit.name}</p>
      <p class="text-lg font-semibold">{splitDayLabel(today.day)}</p>
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">No workout running.</p>
  {/if}

  <div class="flex w-full max-w-xs flex-col gap-2">
    {#if $activeSplit && today.day}
      <Button class="w-full" disabled={busy} onclick={() => void run(startPlannedWorkout)}>
        Start {today.day.name || `Day ${today.day.orderIndex + 1}`}
      </Button>
      <Button variant="outline" class="w-full" disabled={busy} onclick={() => void run(startEmptyWorkout)}>
        <Plus class="h-4 w-4" /> Empty workout
      </Button>
    {:else}
      <Button class="w-full" disabled={busy} onclick={() => void run(startEmptyWorkout)}>
        <Plus class="h-4 w-4" /> Start workout
      </Button>
    {/if}
    {#if hasPreviousSession}
      <Button
        variant="ghost"
        class="w-full"
        disabled={busy}
        onclick={() => void run(() => currentSession.repeatLast())}
      >
        <RotateCcw class="h-4 w-4" /> Repeat last workout
      </Button>
    {/if}
  </div>
</div>
