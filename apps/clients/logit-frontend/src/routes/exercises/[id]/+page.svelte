<script lang="ts">
  // An exercise as a page (from the Exercises list, history, goals): the same three tabs as the
  // sheet a workout opens (design canvas E1–E3).
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import ExerciseView from "$lib/features/exercise/components/ExerciseView.svelte";
  import { page } from "$app/state";
  import type { Exercise } from "@logit/core/domain/exercise";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  let exerciseName = $state("Exercise");
  // ?tab=settings opens straight on Settings (from Settings › exercise overrides).
  const tab = $derived.by(() => {
    const t = page.url.searchParams.get("tab");
    return t === "howto" || t === "settings" ? t : "progress";
  });
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/exercises")} />
    <div class="min-w-0 flex-1">
      <h1 class="block truncate text-base font-semibold">{exerciseName}</h1>
    </div>
  </PageHeader>

  {#key id}
    <ExerciseView
      exerciseId={id}
      {tab}
      onExercise={(ex: Exercise | null) => (exerciseName = ex?.name ?? "Exercise")}
      onDeleted={() => back("/exercises")}
    />
  {/key}
</div>
