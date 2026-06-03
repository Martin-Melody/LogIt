<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  const {
    canFinish = false,
    saving = false,
    onFinish = () => {},
    onDiscard,
  }: {
    canFinish?: boolean;
    saving?: boolean;
    onFinish?: () => void | Promise<void>;
    onDiscard?: () => void | Promise<void>;
  } = $props();
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
    <button
      type="button"
      class="text-xs text-muted-foreground hover:text-destructive transition-colors"
      disabled={saving}
      onclick={() => void onDiscard?.()}
    >
      Discard workout
    </button>
  {/if}
</div>
