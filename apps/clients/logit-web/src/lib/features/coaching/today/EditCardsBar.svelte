<!-- Canvas W13: editing Today's or Your month's cards. Cards you have get ↑ ↓ × (drag works too);
     Needs you stays first. "Add a card" lists the rest. Only you see your layout. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { PAGE_CARDS, type PageCard, type PageId } from "@logit/core/domain/coachMonth";
  import { cardPackCardId } from "@logit/core/plugins/cardPack";
  import { cardPacks } from "./cardPacks.svelte";

  let { page, cards = $bindable(), ondone, onstandard, saving = false }: {
    page: PageId; cards: PageCard[]; ondone: () => void; onstandard: () => void; saving?: boolean;
  } = $props();
  const missing = $derived(PAGE_CARDS.filter((c) => c.pages.includes(page) && !cards.includes(c.id)));
  $effect(() => void cardPacks.load());
  const packCards = $derived(cardPacks.list.flatMap((p) => p.cards.map((c) => ({ id: cardPackCardId(p.pluginId, c.id), name: c.name, pack: p.name }))).filter((c) => !cards.includes(c.id as PageCard)));
</script>

<div class="flex flex-col gap-3 rounded-[10px] border border-dashed border-primary/40 bg-muted/30 px-4 py-3" role="region" aria-label="Edit cards">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-[13px]"><b class="font-semibold">Editing {page === "today" ? "Today" : "Your month"}</b> <span class="text-muted-foreground">· drag or use the arrows to move, × to remove. Only you see your layout.</span></span>
    <span class="flex gap-2">
      <Button variant="ghost" size="sm" onclick={onstandard}>Back to the standard layout</Button>
      <Button size="sm" disabled={saving} onclick={ondone}>Done</Button>
    </span>
  </div>
  {#if missing.length || packCards.length}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs text-muted-foreground">Add a card:</span>
      {#each missing as c (c.id)}
        <Button variant="outline" size="sm" class="h-7 rounded-full text-xs" title={c.hint} onclick={() => (cards = [...cards, c.id])}><PlusIcon class="size-3" /> {c.name}</Button>
      {/each}
      {#if packCards.length}<span class="ml-2 text-xs text-muted-foreground">From your card packs:</span>{/if}
      {#each packCards as c (c.id)}
        <Button variant="outline" size="sm" class="h-7 rounded-full text-xs" title={c.pack} onclick={() => (cards = [...cards, c.id as PageCard])}><PlusIcon class="size-3" /> {c.name}</Button>
      {/each}
    </div>
  {/if}
  <span class="flex items-center gap-2 text-xs text-muted-foreground">More cards come as card packs. <Button variant="ghost" size="sm" class="h-7 text-xs" href="/coaching/plugins?tab=community">Find card packs</Button></span>
</div>
