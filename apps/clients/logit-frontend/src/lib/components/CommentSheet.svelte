<script lang="ts">
  import { Loader2, Send, X } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiComment, type ApiPost } from "@logit/core/api/socialApi";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import CommentList from "./social/CommentList.svelte";

  interface Props {
    post: ApiPost | null;
    onclose: () => void;
    oncommentcountchange?: (postId: string, delta: number) => void;
  }

  const { post, onclose, oncommentcountchange }: Props = $props();

  let comments = $state<ApiComment[]>([]);
  let loading = $state(false);
  let submitting = $state(false);
  let body = $state("");

  $effect(() => {
    if (post) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  $effect(() => {
    if (post) {
      comments = [];
      loading = true;
      socialApi.getComments(post.id).then((page) => {
        comments = page.comments;
        loading = false;
      }).catch(() => {
        loading = false;
      });
    }
  });

  async function submit() {
    if (!post || !body.trim() || submitting) return;
    submitting = true;
    const text = body.trim();
    body = "";
    try {
      const comment = await socialApi.addComment(post.id, text);
      comments = [...comments, comment];
      oncommentcountchange?.(post.id, 1);
    } catch {
      body = text;
    } finally {
      submitting = false;
    }
  }
</script>

{#if post}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 bg-black/40 z-40"
    onclick={onclose}
    aria-label="Close"
  ></button>

  <!-- Sheet -->
  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl border-t border-border max-h-[80dvh]">
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <p class="text-sm font-semibold">Comments</p>
      <button type="button" class="p-1 text-muted-foreground" onclick={onclose}>
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex justify-center py-10">
          <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      {:else}
        <CommentList
          bind:comments
          postId={post.id}
          oncountchange={(d) => oncommentcountchange?.(post.id, d)}
        />
      {/if}
    </div>

    <!-- Compose -->
    {#if authStore.isAuthenticated}
      <div class="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <textarea
          bind:value={body}
          rows={1}
          placeholder="Add a comment…"
          class="flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[38px] max-h-32"
          onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        ></textarea>
        <button
          type="button"
          class="h-[38px] w-[38px] flex items-center justify-center rounded bg-primary text-primary-foreground shrink-0 disabled:opacity-50"
          disabled={!body.trim() || submitting}
          onclick={() => void submit()}
        >
          {#if submitting}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Send class="h-4 w-4" />
          {/if}
        </button>
      </div>
    {:else}
      <p class="text-xs text-muted-foreground text-center py-3 border-t border-border shrink-0">
        Sign in to leave a comment.
      </p>
    {/if}
  </div>
{/if}
