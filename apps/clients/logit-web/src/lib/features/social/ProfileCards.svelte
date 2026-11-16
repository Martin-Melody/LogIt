<script lang="ts">
  import { CARD_BY_ID, CARD_TITLE, cardHasData, orderedWidgets, parseProfileData } from "./profileCards";
  import ProfileCardBody from "./ProfileCardBody.svelte";

  // The profile cards someone turned on (their snapshot, built by their phone), in their order.
  let { json, name }: { json: string | null; name: string } = $props();

  const data = $derived(parseProfileData(json));
  const cards = $derived(data ? orderedWidgets(data).filter((w) => w.enabled && cardHasData(data, CARD_BY_ID[w.id]!)).map((w) => CARD_BY_ID[w.id]!) : []);
</script>

{#if data && cards.length}
  <div class="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
    {#each cards as card (card)}
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{CARD_TITLE[card]}</h2>
        <ProfileCardBody {data} kind={card} {name} />
      </section>
    {/each}
  </div>
{/if}
