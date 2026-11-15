<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Loader2 } from "lucide-svelte";
  import { isPrivateError, socialApi, type ApiProfile } from "@logit/core/api/socialApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { toast } from "svelte-sonner";

  const { username, mode }: { username: string; mode: "followers" | "following" } = $props();

  let list = $state<ApiProfile[]>([]);
  let loading = $state(true);
  let error = $state(false);
  let isPrivate = $state(false);
  let removing = $state<ApiProfile | null>(null);
  // Your own followers list: you can remove someone without blocking them.
  const ownFollowers = $derived(mode === "followers" && authStore.user?.username === username);

  async function remove() {
    const u = removing;
    if (!u) return;
    removing = null;
    try {
      await socialApi.removeFollower(u.username);
      list = list.filter((x) => x.id !== u.id);
      toast.success(`Removed @${u.username}`);
    } catch {
      toast.error("Couldn't remove them");
    }
  }

  onMount(async () => {
    try {
      list = mode === "followers"
        ? await socialApi.getFollowers(username)
        : await socialApi.getFollowing(username);
    } catch (e) {
      if (isPrivateError(e)) isPrivate = true;
      else error = true;
    } finally {
      loading = false;
    }
  });

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
</script>

<div class="flex flex-col min-h-full">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <h1 class="page-title">@{username} · {mode === "followers" ? "Followers" : "Following"}</h1>
  </PageHeader>

  {#if loading}
    <div class="flex justify-center py-16"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else if isPrivate}
    <p class="text-sm text-muted-foreground text-center py-16 px-8">This account is private. Only people they've accepted can see this list.</p>
  {:else if error}
    <p class="text-sm text-muted-foreground text-center py-16">Couldn't load this list.</p>
  {:else if list.length === 0}
    <p class="text-sm text-muted-foreground text-center py-16">
      {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
    </p>
  {:else}
    <ul class="divide-y divide-border">
      {#each list as u (u.id)}
        <li class="flex items-center pr-4">
          <button type="button" class="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40" onclick={() => goto(`/social/${u.username}`)}>
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
          {#if ownFollowers}
            <button type="button" class="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs" onclick={() => (removing = u)}>Remove</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if removing}
  <button type="button" class="fixed inset-0 bg-black/50 z-50" aria-label="Cancel" onclick={() => (removing = null)}></button>
  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(90vw,20rem)] rounded-xl border border-border bg-background p-5 flex flex-col gap-3">
    <p class="text-sm font-semibold">Remove @{removing.username}?</p>
    <p class="text-xs text-muted-foreground">They stop following you. They aren't told, and they can follow (or ask to follow) you again.</p>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" class="text-xs text-muted-foreground px-3 py-1.5" onclick={() => (removing = null)}>Cancel</button>
      <button type="button" class="text-xs bg-destructive text-destructive-foreground rounded-md px-3 py-1.5" onclick={remove}>Remove</button>
    </div>
  </div>
{/if}
