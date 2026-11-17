<script lang="ts">
  import { Copy, Rss, Share2 } from "lucide-svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { recipeShareMessage, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";

  // Share a built algorithm: to your feed (opens the post composer with it attached), or as
  // a code in a message for any app. Only the blocks go, nothing about your lifts.
  const { recipe, canPost, onpost, onclose }: {
    recipe: ProgressionRecipe;
    /** Posting needs an account; the code doesn't. */
    canPost: boolean;
    onpost: () => void;
    onclose: () => void;
  } = $props();

  let codeOpened = $state(false);
  const showCode = $derived(codeOpened || !canPost);
  const message = $derived(recipeShareMessage(recipe));
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Copied. Paste it into any message.");
    } catch {
      toast("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: recipe.name, text: message });
    } catch {
      // Cancelled, or not allowed here.
    }
  }
</script>

<BottomSheet label="Share {recipe.name}" {onclose}>
  <h2 class="px-5 pb-1.5 text-lg font-bold">Share {recipe.name}</h2>
  <div class="flex flex-col" data-testid="share-recipe">
    {#if canPost}
      <button type="button" class="flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left" onclick={onpost}>
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Rss class="size-[18px]" /></span>
        <span class="flex-1"><span class="block font-medium">Post to your feed</span><span class="block text-xs text-muted-foreground">With a note, for the people who follow you</span></span>
      </button>
    {/if}
    <button type="button" class="flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left {canPost ? 'border-t border-border' : ''}" aria-expanded={showCode} onclick={() => (codeOpened = true)}>
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Share2 class="size-[18px]" /></span>
      <span class="flex-1"><span class="block font-medium">Send as a code</span><span class="block text-xs text-muted-foreground">Any app: WhatsApp, Messages, email. No account needed</span></span>
    </button>
  </div>
  {#if showCode}
    <div class="mx-4 mt-2 flex flex-col gap-2.5 rounded-xl bg-muted/60 p-3.5 dark:bg-background">
      <p class="text-xs text-muted-foreground">What gets sent</p>
      <p class="select-all whitespace-pre-wrap break-all font-mono text-xs leading-relaxed" data-testid="share-code">{message}</p>
      <div class="flex gap-2">
        <button type="button" class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground" onclick={() => void copy()}>
          <Copy class="size-4" /> Copy
        </button>
        {#if canNativeShare}
          <button type="button" class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border font-medium" onclick={() => void share()}>
            <Share2 class="size-4" /> Share
          </button>
        {/if}
      </div>
    </div>
  {/if}
  <p class="px-5 pb-2 pt-3 text-xs leading-relaxed text-muted-foreground">Only the blocks are shared, nothing about your lifts.</p>
</BottomSheet>
