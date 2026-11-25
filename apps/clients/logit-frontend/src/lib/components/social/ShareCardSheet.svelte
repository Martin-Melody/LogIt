<!-- "Share a workout or record" from a chat's + button: your recent finished workouts and your
     records, one tap sends it as a card. As the "Your story" picker it also offers a photo. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Camera, Dumbbell, Trophy } from "lucide-svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { getPersonalRecords, type PersonalRecord } from "$lib/usecases/getPersonalRecords";
  import { cardTitle, readCard, recordCard, workoutCard } from "@logit/core/domain/messageCard";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { dayTime } from "$lib/features/friends/dmTime";
  import { pickStoryPhoto } from "$lib/features/friends/stories.svelte";

  const { onpick, onphoto, onclose, title = "Share a workout or record" }: {
    onpick: (card: { type: string; json: string }) => void;
    /** Offer "A photo" too (the story picker): called with the chosen photo. */
    onphoto?: (photo: string) => void;
    onclose: () => void;
    title?: string;
  } = $props();

  let tab = $state<"workouts" | "records">("workouts");
  let sessions = $state<WorkoutSession[] | null>(null);
  let records = $state<PersonalRecord[] | null>(null);
  const now = Date.now();

  onMount(async () => {
    const all = await getWorkoutRepo().listAllSessions().catch(() => []);
    sessions = all.filter((s) => s.endedAtMs).sort((a, b) => (b.endedAtMs ?? 0) - (a.endedAtMs ?? 0)).slice(0, 20);
    records = await getPersonalRecords(20).catch(() => []);
  });

  const row = "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/50";
</script>

<BottomSheet label={title} {onclose}>
  <div class="flex flex-col gap-3 px-4 pb-4">
    <h2 class="text-[17px] font-semibold">{title}</h2>
    {#if onphoto}
      <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold"
        onclick={async () => { const p = await pickStoryPhoto(); if (p) onphoto(p); }}><Camera class="size-[18px]" />A photo</button>
    {/if}
    <div class={segmentTrack} role="tablist" aria-label="What to share">
      <button type="button" role="tab" aria-selected={tab === "workouts"} class={segment(tab === "workouts")} onclick={() => (tab = "workouts")}>Workouts</button>
      <button type="button" role="tab" aria-selected={tab === "records"} class={segment(tab === "records")} onclick={() => (tab = "records")}>Records</button>
    </div>
    <div class="flex max-h-[50vh] flex-col overflow-y-auto">
      {#if tab === "workouts"}
        {#if sessions === null}
          <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        {:else if sessions.length === 0}
          <p class="py-6 text-center text-sm text-muted-foreground">Finish a workout and it shows here.</p>
        {:else}
          {#each sessions as s (s.id)}
            {@const json = workoutCard(s)}
            <button type="button" class={row} onclick={() => onpick({ type: "WorkoutSession", json })}>
              <Dumbbell class="size-4 shrink-0 text-muted-foreground" />
              <span class="flex min-w-0 flex-col"><span class="truncate text-[15px] font-medium">{cardTitle(readCard("WorkoutSession", json)!)}</span><span class="text-[13px] text-muted-foreground">{dayTime(s.endedAtMs!, now)}</span></span>
            </button>
          {/each}
        {/if}
      {:else if records === null}
        <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      {:else if records.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">Your best sets show here once you've logged some.</p>
      {:else}
        {#each records as r (r.exerciseName)}
          {@const json = recordCard({ exerciseName: r.exerciseName, weight: r.weight, reps: r.reps, atMs: r.achievedAtMs })}
          <button type="button" class={row} onclick={() => onpick({ type: "PersonalRecord", json })}>
            <Trophy class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex min-w-0 flex-col"><span class="truncate text-[15px] font-medium tabular-nums">{cardTitle(readCard("PersonalRecord", json)!)}</span><span class="text-[13px] text-muted-foreground">{dayTime(r.achievedAtMs, now)}</span></span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</BottomSheet>
