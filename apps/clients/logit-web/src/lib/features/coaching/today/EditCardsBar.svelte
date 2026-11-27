<!-- Canvas W13: editing Today's or Your month's cards. Cards you have get ↑ ↓ × (drag works too);
     Needs you stays first. "Add a card" lists the rest. Only you see your layout. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { PAGE_CARDS, type PageCardId, type PageId } from "@logit/core/domain/coachMonth";

  let { page, cards = $bindable(), ondone, onstandard, saving = false }: {
    page: PageId; cards: PageCardId[]; ondone: () => void; onstandard: () => void; saving?: boolean;
  } = $props();
  const missing = $derived(PAGE_CARDS.filter((c) => c.pages.includes(page) && !cards.includes(c.id)));
</script>

<div class="flex flex-col gap-3 rounded-[10px] border border-dashed border-primary/40 bg-muted/30 px-4 py-3" role="region" aria-label="Edit cards">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-[13px]"><b class="font-semibold">Editing {page === "today" ? "Today" : "Your month"}</b> <span class="text-muted-foreground">· drag or use the arrows to move, × to remove. Only you see your layout.</span></span>
    <span class="flex gap-2">
      <Button variant="ghost" size="sm" onclick={onstandard}>Back to the standard layout</Button>
      <Button size="sm" disabled={saving} onclick={ondone}>Done</Button>
    </span>
  </div>
  {#if missing.length}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs text-muted-foreground">Add a card:</span>
      {#each missing as c (c.id)}
        <Button variant="outline" size="sm" class="h-7 rounded-full text-xs" title={c.hint} onclick={() => (cards = [...cards, c.id])}><PlusIcon class="size-3" /> {c.name}</Button>
      {/each}
    </div>
  {/if}
</div>
