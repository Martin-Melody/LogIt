<script lang="ts">
  import { CARD_TITLE, parseProfileData, shownCards } from "./profileCards";
  import ProfileCardBody from "./ProfileCardBody.svelte";

  // The profile cards someone turned on (their snapshot, built by their phone), in their order.
  // `column`: one card per row (the Training column beside the posts).
  let { json, name, column = false }: { json: string | null; name: string; column?: boolean } = $props();

  const data = $derived(parseProfileData(json));
  const cards = $derived(shownCards(data));
</script>

{#if data && cards.length}
  <div class="grid gap-3.5 {column ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fit,minmax(230px,1fr))]'}">
    {#each cards as card (card)}
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{CARD_TITLE[card]}</h2>
        <ProfileCardBody {data} kind={card} {name} />
      </section>
    {/each}
  </div>
{/if}
