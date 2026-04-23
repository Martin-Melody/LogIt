<script lang="ts">
  const { onAddExercise = () => {} } = $props<{
    onAddExercise?: () => void | Promise<void>;
  }>();
</script>

<div class="flex flex-col items-center gap-3 py-10 text-center px-3">
  <p class="text-sm text-muted-foreground">No exercises yet.</p>
  <button
    type="button"
    class="text-sm font-medium underline-offset-2 hover:underline"
    onclick={() => void onAddExercise()}
  >
    Add first exercise
  </button>
</div>
