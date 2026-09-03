<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2 } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { socialApi, type BlockedUser } from "@logit/core/api/socialApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { toast } from "svelte-sonner";

  let list = $state<BlockedUser[]>([]);
  let loading = $state(true);
  let unblocking = $state<string | null>(null);

  onMount(async () => {
    if (!authStore.isAuthenticated) { loading = false; return; }
    try {
      list = await socialApi.getBlockedUsers();
    } catch {
      // non-fatal
    } finally {
      loading = false;
    }
  });

  async function unblock(u: BlockedUser) {
    if (unblocking) return;
    unblocking = u.id;
    try {
      await socialApi.unblockUser(u.username);
      list = list.filter((x) => x.id !== u.id);
      toast.success(`Unblocked @${u.username}`);
    } catch {
      toast.error("Couldn't unblock");
    } finally {
      unblocking = null;
    }
  }
</script>

{#if authStore.isAuthenticated && (loading || list.length > 0)}
  <Card.Root>
    <Card.Header>
      <Card.Title>Blocked accounts</Card.Title>
      <Card.Description>People you've blocked can't see or interact with you.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      {#if loading}
        <div class="flex justify-center py-3"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
      {:else}
        {#each list as u (u.id)}
          <div class="flex items-center gap-2">
            <div class="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold overflow-hidden shrink-0">
              {#if u.avatarUrl}
                <img src={u.avatarUrl} alt={u.displayName} class="h-full w-full object-cover" />
              {:else}
                {u.displayName.charAt(0).toUpperCase()}
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm truncate">{u.displayName}</p>
              <p class="text-[11px] text-muted-foreground truncate">@{u.username}</p>
            </div>
            <button
              type="button"
              class="text-xs rounded border border-border px-2.5 py-1 disabled:opacity-50 shrink-0"
              disabled={unblocking === u.id}
              onclick={() => unblock(u)}
            >
              {unblocking === u.id ? "…" : "Unblock"}
            </button>
          </div>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>
{/if}
