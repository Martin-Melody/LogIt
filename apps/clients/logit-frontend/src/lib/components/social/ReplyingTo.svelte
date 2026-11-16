<script lang="ts">
  import { X } from "lucide-svelte";
  import type { ApiComment } from "@logit/core/api/socialApi";
  import { authStore } from "$lib/api/authStore.svelte";

  let { comment, oncancel }: { comment: ApiComment; oncancel: () => void } = $props();
</script>

<div class="flex items-center justify-between pl-4 pr-1 pt-1 text-xs text-muted-foreground">
  <span>Replying to <strong class="text-foreground font-semibold">{comment.authorId === authStore.user?.id ? "yourself" : comment.authorDisplayName}</strong></span>
  <button type="button" class="h-8 w-11 flex items-center justify-center" aria-label="Cancel reply" onclick={oncancel}>
    <X class="h-3.5 w-3.5" />
  </button>
</div>
