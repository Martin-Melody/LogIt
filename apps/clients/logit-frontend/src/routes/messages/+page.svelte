<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, MessageSquare } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import { coachApi } from "@logit/core/api/coachApi";
  import { getMessagesRepo } from "$lib/data/repoProvider";
  import { pullAndMergeMessages } from "$lib/sync/syncService";

  type Thread = { relationshipId: string; name: string; unread: number };

  const ui = $state({ loading: true, error: null as string | null });
  let threads = $state<Thread[]>([]);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      await pullAndMergeMessages();
      const [coaches, clients] = await Promise.all([
        coachApi.listCoaches().catch(() => []),
        coachApi.listClients().catch(() => []),
      ]);
      const repo = getMessagesRepo();
      const rows: Omit<Thread, "unread">[] = [
        ...coaches.map((c) => ({ relationshipId: c.relationshipId, name: c.coach.displayName || c.coach.username })),
        ...clients.map((c) => ({ relationshipId: c.relationshipId, name: c.client.displayName || c.client.username })),
      ];
      threads = await Promise.all(
        rows.map(async (t) => ({ ...t, unread: await repo.unreadCount(t.relationshipId) })),
      );
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load messages";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/splits")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Messages</h1>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if threads.length === 0}
    <div class="px-3 py-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
      <MessageSquare class="h-6 w-6" />
      <p class="text-sm">No conversations yet.</p>
    </div>
  {:else}
    <ul class="divide-y divide-border">
      {#each threads as t (t.relationshipId)}
        <li>
          <button type="button" class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
            onclick={() => void goto(`/messages/${t.relationshipId}?name=${encodeURIComponent(t.name)}`)}>
            <span class="text-sm font-medium flex-1 truncate">{t.name}</span>
            {#if t.unread > 0}<Badge class="text-xs px-1.5 py-0">{t.unread}</Badge>{/if}
            <span class="text-muted-foreground text-sm">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
