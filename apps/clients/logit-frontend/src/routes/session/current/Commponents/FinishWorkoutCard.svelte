<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const {
    canFinish = false,
    saving = false,
    exerciseCount = 0,
    loggedSetCount = 0,
    onFinish = () => {},
    onDiscard,
  }: {
    canFinish?: boolean;
    saving?: boolean;
    exerciseCount?: number;
    loggedSetCount?: number;
    onFinish?: () => void | Promise<void>;
    onDiscard?: () => void | Promise<void>;
  } = $props();

  const discardDescription = $derived(
    exerciseCount === 0
      ? "This empty workout will be discarded. This can't be undone."
      : `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}` +
        (loggedSetCount > 0
          ? ` and ${loggedSetCount} logged set${loggedSetCount === 1 ? "" : "s"}`
          : "") +
        " will be permanently deleted. This can't be undone.",
  );
</script>

<div class="py-3 flex flex-col items-center gap-2">
  <Button
    class="w-full"
    onclick={() => void onFinish()}
    disabled={!canFinish || saving}
  >
    Finish workout
  </Button>

  {#if onDiscard}
    <ConfirmDialog
      title="Discard this workout?"
      description={discardDescription}
      confirmLabel="Discard"
      cancelLabel="Keep going"
      {saving}
      onConfirm={onDiscard}
    >
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          disabled={saving}
        >
          Discard workout
        </button>
      {/snippet}
    </ConfirmDialog>
  {/if}
</div>
