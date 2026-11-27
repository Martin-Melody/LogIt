<!-- Canvas W6/W10 on the phone: your saved replies, from "/" at the start of the box or the
     Saved replies button. Tapping one puts it in the box with their name filled in. -->
<script lang="ts">
  import { fillReply, matchReplies, slashQuery, type SavedReply } from "@logit/core/domain/savedReplies";
  import { savedReplies } from "./savedReplies.svelte";

  type Fill = { firstName?: string | null; exercise?: string | null; coachName?: string | null };
  let { draft = $bindable(""), fill, open = $bindable(false) }: { draft?: string; fill: Fill; open?: boolean } = $props();
  const slash = $derived(slashQuery(draft));
  const matches = $derived(slash !== null || open ? matchReplies(savedReplies.list, slash ?? "").slice(0, 5) : []);
  $effect(() => void savedReplies.load());
  function use(r: SavedReply) {
    draft = fillReply(r.body, fill);
    open = false;
  }
</script>

{#if matches.length}
  <ul class="flex flex-col gap-1 px-3 pb-2" aria-label="Saved replies">
    {#each matches as r (r.id)}
      <li><button type="button" class="flex min-h-12 w-full flex-col justify-center rounded-[12px] border border-border bg-card px-3.5 text-left active:bg-muted" onclick={() => use(r)}>
        <span class="text-[15px]"><b class="font-semibold">/{r.shortcut}</b> <span class="text-muted-foreground">{r.title}</span></span>
        <span class="line-clamp-1 text-[13px] text-muted-foreground">{fillReply(r.body, fill)}</span>
      </button></li>
    {/each}
  </ul>
{:else if (slash !== null || open) && savedReplies.loaded}
  <p class="mx-3 mb-2 rounded-[12px] border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">No saved replies match. Make them on the web: Messages › ⋯ › Saved replies.</p>
{/if}
