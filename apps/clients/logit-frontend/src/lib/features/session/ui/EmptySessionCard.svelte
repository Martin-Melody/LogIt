<script lang="ts">
  import { RotateCcw, Plus } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";

  const {
    canRepeat = false,
    busy = false,
    onAddBlock = () => {},
    onRepeatLast = () => {},
  } = $props<{
    canRepeat?: boolean;
    busy?: boolean;
    onAddBlock?: () => void | Promise<void>;
    onRepeatLast?: () => void | Promise<void>;
  }>();
</script>

<div class="flex flex-col items-center gap-3 py-10 text-center px-6">
  <p class="text-sm text-muted-foreground">Nothing logged yet.</p>

  <div class="flex flex-col gap-2 w-full max-w-xs">
    {#if canRepeat}
      <Button variant="outline" class="w-full" disabled={busy} onclick={() => void onRepeatLast()}>
        <RotateCcw class="h-4 w-4" /> Repeat last workout
      </Button>
    {/if}
    <Button class="w-full" disabled={busy} onclick={() => void onAddBlock()}>
      <Plus class="h-4 w-4" /> Add exercise
    </Button>
  </div>
</div>
