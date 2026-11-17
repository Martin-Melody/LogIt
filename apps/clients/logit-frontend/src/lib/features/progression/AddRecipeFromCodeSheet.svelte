<script lang="ts">
  import { untrack } from "svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import RecipeBlocks from "./RecipeBlocks.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { addSharedRecipeToMine } from "$lib/features/social/copyToMine";
  import { parseRecipeShareCode } from "@logit/core/domain/progressionRecipe";

  // Paste a code (or the whole message it came in) someone sent, see the blocks, add a copy.
  const { onclose, onadded, initialText = "" }: { onclose: () => void; onadded?: () => void; initialText?: string } = $props();

  let text = $state(untrack(() => initialText));
  let adding = $state(false);
  const shared = $derived(text.trim() ? parseRecipeShareCode(text) : null);

  async function add() {
    if (!shared || adding) return;
    adding = true;
    try {
      const row = await addSharedRecipeToMine(shared);
      toast(`Added ${row.name}. Pick it in Progression, or on any exercise.`);
      onadded?.();
      onclose();
    } finally {
      adding = false;
    }
  }
</script>

<BottomSheet label="Add an algorithm from a code" {onclose}>
  <div class="flex flex-col gap-3 px-4 pb-2">
    <h2 class="px-1 text-lg font-bold">Add from a code</h2>
    <label class="flex flex-col gap-1.5">
      <span class="px-1 text-xs font-medium text-muted-foreground">Paste the code, or the whole message it came in</span>
      <textarea
        class="min-h-24 rounded-xl bg-muted px-3.5 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        placeholder="logit-alg1:…"
        bind:value={text}
        data-testid="recipe-code-input"
      ></textarea>
    </label>
    {#if text.trim() && !shared}
      <p class="px-1 text-xs text-destructive">That isn't a LogIt algorithm code. Check you copied all of it.</p>
    {:else if shared}
      <div class="flex flex-col gap-2.5 rounded-xl bg-card p-3.5">
        <p class="font-semibold">{shared.name}</p>
        <RecipeBlocks recipe={shared} />
      </div>
    {/if}
  </div>
  {#snippet footer()}
    <button type="button" class="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50" disabled={!shared || adding} onclick={() => void add()}>
      Add to my algorithms
    </button>
  {/snippet}
</BottomSheet>
