<script lang="ts">
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import ExerciseDetailBody from "$lib/features/exercise/components/ExerciseDetailBody.svelte";
  import type { Exercise } from "@logit/core/domain/exercise";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  let exerciseName = $state("Exercise");
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="page-header">
    <BackButton onclick={() => back("/exercises")} />
    <div class="flex-1 min-w-0">
      <span class="text-base font-semibold truncate block">{exerciseName}</span>
    </div>
  </div>

  <ExerciseDetailBody
    exerciseId={id}
    onExercise={(ex: Exercise | null) => (exerciseName = ex?.name ?? "Exercise")}
    onDeleted={() => back("/exercises")}
  />
</div>
