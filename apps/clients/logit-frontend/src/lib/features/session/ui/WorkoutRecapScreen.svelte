<script lang="ts">
  import { CheckCircle2 } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import type { WorkoutSession, CardioBlockData } from "@logit/core/domain/workout";
  import { getExercises, getTopSetHighlight } from "@logit/core/domain/workout";
  import { formatDuration } from "@logit/core/domain/time";

  import { authStore } from "$lib/api/authStore.svelte";

  const { session, onDone, onCancel, onShare } = $props<{
    session: WorkoutSession;
    onDone: () => void | Promise<void>;
    onCancel?: () => void;
    onShare?: (session: WorkoutSession) => void;
  }>();

  const durationMs = Math.max(0, Date.now() - session.startedAtMs);
  const exercises = getExercises(session);
  const topSet = getTopSetHighlight(session);
  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalVolume = exercises.reduce(
    (vol, ex) => vol + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0),
    0,
  );

  const cardioBlocks = session.blocks.filter((b) => b.type === "cardio");
  const totalCardioDistanceM = cardioBlocks.reduce((sum, b) => {
    const data = b.data as CardioBlockData;
    return sum + data.intervals.reduce((s, iv) => s + (iv.distanceM ?? 0), 0);
  }, 0);
  const totalCardioDurationMs = cardioBlocks.reduce((sum, b) => {
    const data = b.data as CardioBlockData;
    return sum + data.intervals.reduce((s, iv) => s + (iv.durationMs ?? 0), 0);
  }, 0);

  function formatDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
  }

  const stats: { label: string; value: string }[] = [
    { label: "Duration", value: formatDuration(durationMs) },
    { label: "Blocks", value: String(session.blocks.length) },
    ...(totalSets > 0 ? [{ label: "Sets", value: String(totalSets) }] : []),
    ...(totalVolume > 0 ? [{ label: "Volume", value: `${totalVolume.toLocaleString()} kg` }] : []),
    ...(totalCardioDistanceM > 0 ? [{ label: "Distance", value: formatDistance(totalCardioDistanceM) }] : []),
    ...(totalCardioDurationMs > 0 ? [{ label: "Cardio time", value: formatDuration(totalCardioDurationMs) }] : []),
  ];
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto pb-[env(safe-area-inset-bottom)]">
  <!-- Top section -->
  <div class="flex flex-col items-center justify-center gap-3 px-6 pt-16 pb-10 text-center">
    <CheckCircle2 class="h-14 w-14 text-primary" strokeWidth={1.5} />
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Workout complete</h1>
      <p class="text-sm text-muted-foreground mt-1">Great work — keep it up!</p>
    </div>
  </div>

  <!-- Stats grid -->
  <div class="mx-4 grid grid-cols-2 gap-2">
    {#each stats as stat (stat.label)}
      <div class="flex flex-col gap-0.5 rounded border border-border px-4 py-3">
        <span class="text-xs text-muted-foreground">{stat.label}</span>
        <span class="text-lg font-semibold tabular-nums">{stat.value}</span>
      </div>
    {/each}
  </div>

  <!-- Top set highlight -->
  {#if topSet}
    <div class="mx-4 mt-2 rounded border border-border px-4 py-3">
      <p class="text-xs text-muted-foreground">Best lift</p>
      <p class="text-sm font-semibold mt-0.5">
        {topSet.exerciseName}
        <span class="font-normal text-muted-foreground">
          · {topSet.reps} reps @ {topSet.weight} kg
        </span>
      </p>
    </div>
  {/if}

  <div class="flex-1" />

  <!-- Done button -->
  <div class="px-4 py-4 flex flex-col gap-2">
    <Button class="w-full" onclick={() => void onDone()}>Save & finish</Button>
    {#if onShare && authStore.isAuthenticated}
      <Button variant="outline" class="w-full" onclick={() => onShare(session)}>Share workout</Button>
    {/if}
    {#if onCancel}
      <Button variant="ghost" class="w-full" onclick={onCancel}>Back to workout</Button>
    {/if}
  </div>
</div>
