<script lang="ts">
  import { X, Loader2 } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { socialApi, type ApiPost, type RepostSource } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { toast } from "svelte-sonner";
  import QuotedPost from "./QuotedPost.svelte";

  interface Props {
    open: boolean;
    /** The post being quoted. */
    post: ApiPost;
    onclose: () => void;
    /** Optional: hand the new repost back so a feed can prepend it. */
    onposted?: (repost: ApiPost) => void;
  }

  const { open, post, onclose, onposted }: Props = $props();

  let body = $state("");
  let submitting = $state(false);

  $effect(() => {
    if (open) {
      body = "";
      submitting = false;
      openOverlay();
      return () => closeOverlay();
    }
  });

  // Quoting a plain repost quotes what it shares, not the empty repost row; quoting a quote
  // nests one level only (the card points at the post directly quoted). The server applies
  // the same rule — this just keeps the preview honest.
  const quoted = $derived<RepostSource>(
    post.repostOf && !post.body
      ? post.repostOf
      : {
          id: post.id,
          authorId: post.authorId,
          authorUsername: post.authorUsername,
          authorDisplayName: post.authorDisplayName,
          authorAvatarUrl: post.authorAvatarUrl,
          type: post.type,
          body: post.body,
          payloadJson: post.payloadJson,
          createdAt: post.createdAt,
          deleted: false,
        },
  );

  async function submit() {
    if (submitting || !body.trim()) return;
    submitting = true;
    try {
      const repost = await socialApi.repost(quoted.id, body);
      toast.success("Quote posted");
      onposted?.(repost);
      onclose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.error("Your session expired — sign in again");
      else if (e instanceof ApiError && e.message) toast.error(e.message);
      else toast.error("Couldn't post this");
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <button type="button" aria-label="Close" class="fixed inset-0 z-50 bg-black/40" onclick={onclose}></button>

  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
    <div class="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
      <button type="button" class="p-1 -ml-1 text-muted-foreground" onclick={onclose}>
        <X class="h-5 w-5" />
      </button>
      <span class="text-sm font-semibold flex-1">Quote post</span>
      <button
        type="button"
        class="px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
        disabled={submitting || !body.trim()}
        onclick={() => void submit()}
      >
        {#if submitting}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
        {submitting ? "Posting…" : "Post"}
      </button>
    </div>

    <div class="flex flex-col gap-3 px-4 pt-4 overflow-y-auto flex-1">
      <textarea
        rows={3}
        placeholder="Add a comment…"
        class="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/60"
        bind:value={body}
      ></textarea>

      <QuotedPost source={quoted} preview />

      <div class="h-2 shrink-0"></div>
    </div>
  </div>
{/if}
