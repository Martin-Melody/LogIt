<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Loader2 } from "lucide-svelte";
  import { socialApi, type ApiProfile } from "@logit/core/api/socialApi";

  const { username, mode }: { username: string; mode: "followers" | "following" } = $props();

  let list = $state<ApiProfile[]>([]);
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    try {
      list = mode === "followers"
        ? await socialApi.getFollowers(username)
        : await socialApi.getFollowing(username);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
</script>

<div class="flex flex-col min-h-full">
  <header class="flex items-center gap-2 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" aria-label="Back" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <span class="text-sm font-semibold">@{username} · {mode === "followers" ? "Followers" : "Following"}</span>
  </header>

  {#if loading}
    <div class="flex justify-center py-16"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else if error}
    <p class="text-sm text-muted-foreground text-center py-16">Couldn't load this list.</p>
  {:else if list.length === 0}
    <p class="text-sm text-muted-foreground text-center py-16">
      {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
    </p>
  {:else}
    <ul class="divide-y divide-border">
      {#each list as u (u.id)}
        <li>
          <button type="button" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40" onclick={() => goto(`/social/${u.username}`)}>
            <div class="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
              {#if u.avatarUrl}
                <img src={u.avatarUrl} alt={u.displayName} class="h-full w-full object-cover" />
              {:else}
                {initials(u.displayName)}
              {/if}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{u.displayName}</p>
              <p class="text-xs text-muted-foreground truncate">@{u.username}</p>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
