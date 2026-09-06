<script lang="ts">
  import { goto } from "$app/navigation";
  import type { RepostSource } from "@logit/core/api/socialApi";
  import { formatDistanceToNow } from "$lib/utils";
  import MentionText from "./MentionText.svelte";
  import PostAttachment from "./PostAttachment.svelte";

  // The original a repost points at, rendered as a nested "quoted" card (Twitter/X style).
  // Display-only: no like/comment affordances of its own — those belong to the original,
  // reached by tapping through.
  // `preview` = shown inside the compose sheet; render it inert (no tap-through).
  const { source, preview = false }: { source: RepostSource; preview?: boolean } = $props();

  const base = "rounded-lg border border-border bg-muted/20 px-3 py-2.5 flex flex-col gap-1.5 transition-colors";

  function open(e: Event) {
    e.stopPropagation();
    void goto(`/social/post/${source.id}`);
  }
</script>

{#snippet card()}
  <div class="flex items-center gap-1.5 text-xs min-w-0">
    <span class="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold shrink-0 overflow-hidden">
      {#if source.authorAvatarUrl}
        <img src={source.authorAvatarUrl} alt={source.authorDisplayName} class="h-full w-full object-cover" />
      {:else}
        {source.authorDisplayName.charAt(0).toUpperCase()}
      {/if}
    </span>
    <span class="font-semibold truncate">{source.authorDisplayName}</span>
    <span class="text-muted-foreground truncate">
      @{source.authorUsername} · {formatDistanceToNow(new Date(source.createdAt))}
    </span>
  </div>

  {#if source.body}
    <MentionText text={source.body} class="text-sm whitespace-pre-wrap break-words" />
  {/if}

  <PostAttachment post={source} />
{/snippet}

{#if source.deleted}
  <div class="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground italic">
    Original post was deleted.
  </div>
{:else if preview}
  <div class={base}>{@render card()}</div>
{:else}
  <div
    class="{base} cursor-pointer hover:bg-muted/30"
    role="link"
    tabindex="0"
    onclick={open}
    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } }}
  >
    {@render card()}
  </div>
{/if}
