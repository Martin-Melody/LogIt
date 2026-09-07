<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import ExerciseDetailBody from "$lib/features/exercise/components/ExerciseDetailBody.svelte";
  import type { Exercise } from "@logit/core/domain/exercise";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  let exerciseName = $state("Exercise");
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/exercises")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="flex-1 min-w-0">
      <span class="text-sm font-semibold truncate block">{exerciseName}</span>
    </div>
  </div>

  <ExerciseDetailBody
    exerciseId={id}
    onExercise={(ex: Exercise | null) => (exerciseName = ex?.name ?? "Exercise")}
    onDeleted={() => back("/exercises")}
  />
</div>
