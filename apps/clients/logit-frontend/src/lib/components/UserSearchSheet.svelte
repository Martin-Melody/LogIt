<script lang="ts">
  import { toast } from "svelte-sonner";
  import { fade } from "svelte/transition";
  import { sheetUp } from "$lib/transitions";
  import { backDismiss, sheetDrag } from "$lib/components/sheet/sheet";
  import { goto } from "$app/navigation";
  import { X, Search, UserPlus, UserCheck, Loader2, Link2 } from "lucide-svelte";
  import { openInvite } from "$lib/features/friends/invite.svelte";
  import { socialApi, type UserSearchResult } from "@logit/core/api/socialApi";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";

  const { open, onclose } = $props<{
    open: boolean;
    onclose: () => void;
  }>();

  let query = $state("");
  let results = $state<UserSearchResult[]>([]);
  let loading = $state(false);
  let searched = $state(false);
  let followingIds = $state<Set<string>>(new Set());
  let togglingId = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (open) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  $effect(() => {
    if (open) {
      query = "";
      results = [];
      searched = false;
      followingIds = new Set();
      // Focus input after the sheet animates in
      setTimeout(() => inputEl?.focus(), 80);
    }
  });

  function onInput() {
    clearTimeout(debounceTimer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      searched = false;
      return;
    }
    debounceTimer = setTimeout(() => void search(q), 250);
  }

  async function search(q: string) {
    loading = true;
    searched = false;
    try {
      const res = await socialApi.searchUsers(q);
      results = res;
      // Seed local follow state from server response
      followingIds = new Set(res.filter((u) => u.isFollowing).map((u) => u.id));
      requestedIds = new Set(res.filter((u) => u.isRequested).map((u) => u.id));
      searched = true;
    } catch {
      results = [];
      searched = true;
    } finally {
      loading = false;
    }
  }

  // Private accounts you asked to follow (search results don't say; this session only).
  let requestedIds = $state(new Set<string>());

  async function toggleFollow(user: UserSearchResult) {
    if (togglingId === user.id) return;
    togglingId = user.id;
    const wasFollowing = followingIds.has(user.id);
    const wasRequested = requestedIds.has(user.id);
    try {
      if (wasFollowing || wasRequested) {
        await socialApi.unfollow(user.username);
        followingIds = new Set([...followingIds].filter((id) => id !== user.id));
        requestedIds = new Set([...requestedIds].filter((id) => id !== user.id));
      } else {
        const status = await socialApi.follow(user.username);
        if (status === "requested") requestedIds = new Set([...requestedIds, user.id]);
        else followingIds = new Set([...followingIds, user.id]);
      }
    } catch {
      toast.error("Couldn't do that. Try again.");
    } finally {
      togglingId = null;
    }
  }

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function openProfile(username: string) {
    onclose();
    void goto(`/social/${username}`);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/50"
    role="presentation"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  ></div>

  <!-- Sheet -->
  <div
    class="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background border-t border-border rounded-t-xl max-h-[90dvh]"
    use:sheetDrag={{ onDismiss: onclose }} use:backDismiss={onclose}
    transition:sheetUp
  >
    <!-- Handle -->
    <div class="flex justify-center pt-2.5 pb-1 shrink-0">
      <div data-sheet-bar class="h-1 w-10 rounded-full bg-muted-foreground/20"></div>
    </div>

    <!-- Search bar -->
    <div class="flex items-center gap-2 px-3 pb-3 pt-1 border-b border-border shrink-0">
      <Search class="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={onInput}
        type="search"
        placeholder="Search by username or name…"
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {#if loading}
        <Loader2 class="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      {/if}
      <button type="button" class="p-1 text-muted-foreground" onclick={onclose}>
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Results -->
    <div class="overflow-y-auto flex-1">
      {#if !searched && query.trim().length < 2}
        <div class="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <p class="text-sm text-muted-foreground">Search for people by username or display name.</p>
          <button type="button" class="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium" onclick={() => { onclose(); openInvite(); }}>
            <Link2 class="size-4" />Invite a friend
          </button>
        </div>

      {:else if searched && results.length === 0}
        <p class="text-sm text-muted-foreground text-center py-12 px-6">
          No users found for "<span class="text-foreground">{query.trim()}</span>".
        </p>

      {:else}
        <ul class="divide-y divide-border pb-8">
          {#each results as user (user.id)}
            {@const isFollowing = followingIds.has(user.id)}
            {@const isRequested = requestedIds.has(user.id)}
            <li class="flex items-center gap-3 px-4 py-3">
              <!-- Avatar (tappable → profile) -->
              <button
                type="button"
                class="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
                onclick={() => openProfile(user.username)}
              >
                {#if user.avatarUrl}
                  <img src={user.avatarUrl} alt={user.displayName} class="h-full w-full object-cover" />
                {:else}
                  {initials(user.displayName)}
                {/if}
              </button>

              <!-- Name + username (tappable → profile) -->
              <button
                type="button"
                class="flex-1 min-w-0 text-left"
                onclick={() => openProfile(user.username)}
              >
                <p class="text-sm font-medium truncate leading-tight">{user.displayName}</p>
                <p class="text-xs text-muted-foreground">@{user.username} · {user.followerCount} follower{user.followerCount === 1 ? "" : "s"}</p>
              </button>

              <!-- Follow / Following -->
              <button
                type="button"
                class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50
                  {isFollowing || isRequested
                    ? 'border border-border text-foreground bg-background hover:bg-muted/40'
                    : 'bg-primary text-primary-foreground'}"
                disabled={togglingId === user.id}
                onclick={() => void toggleFollow(user)}
              >
                {#if togglingId === user.id}
                  <Loader2 class="h-3 w-3 animate-spin" />
                {:else if isFollowing}
                  <UserCheck class="h-3 w-3" /> Following
                {:else if isRequested}
                  Requested
                {:else}
                  <UserPlus class="h-3 w-3" /> {user.followsYou ? "Follow back" : "Follow"}
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
