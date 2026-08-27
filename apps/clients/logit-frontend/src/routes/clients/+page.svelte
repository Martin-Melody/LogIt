<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft } from "lucide-svelte";

  import { apiClient, ApiError } from "@logit/core/api/client";
  import {
    coachApi,
    type ClientRelationship,
    type ReceivedInvite,
    type SentInvite,
  } from "@logit/core/api/coachApi";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { authStore } from "$lib/api/authStore.svelte";

  const isStudio = $derived(authStore.user?.tier === "Studio");

  const ui = $state({ loading: true, error: null as string | null, inviting: false, busyId: null as string | null });
  let clients = $state<ClientRelationship[]>([]);
  let received = $state<ReceivedInvite[]>([]);
  let sent = $state<SentInvite[]>([]);
  let inviteUsername = $state("");
  let inviteError = $state<string | null>(null);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const [r, c, s] = await Promise.all([
        coachApi.listReceivedInvites(),
        isStudio ? coachApi.listClients() : Promise.resolve([]),
        isStudio ? coachApi.listSentInvites() : Promise.resolve([]),
      ]);
      received = r;
      clients = c;
      sent = s;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function invite(e: Event) {
    e.preventDefault();
    const username = inviteUsername.trim();
    if (!username) return;
    ui.inviting = true;
    inviteError = null;
    try {
      await coachApi.inviteClient(username);
      inviteUsername = "";
      await load();
    } catch (e) {
      inviteError = e instanceof ApiError ? e.message : "Failed to send invite — check the username.";
    } finally {
      ui.inviting = false;
    }
  }

  async function act(id: string, fn: () => Promise<void>) {
    ui.busyId = id;
    try {
      await fn();
      await load();
    } finally {
      ui.busyId = null;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/settings")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-sm font-semibold">Coaching</h1>
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    {#if received.length > 0}
      <div class="border-b border-border">
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Coach invites</p>
        <ul class="divide-y divide-border">
          {#each received as inv (inv.relationshipId)}
            <li class="flex items-center justify-between px-3 py-2.5 text-sm">
              <span>{inv.coach.displayName || inv.coach.username}</span>
              <div class="flex gap-2">
                <Button size="sm" disabled={ui.busyId === inv.relationshipId}
                  onclick={() => act(inv.relationshipId, () => coachApi.acceptInvite(inv.relationshipId))}>Accept</Button>
                <Button size="sm" variant="outline" disabled={ui.busyId === inv.relationshipId}
                  onclick={() => act(inv.relationshipId, () => coachApi.declineInvite(inv.relationshipId))}>Decline</Button>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="border-b border-border">
      <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">My clients</p>
      {#if !isStudio}
        <p class="px-3 pb-3 text-sm text-muted-foreground">
          Coaching clients is a Studio-tier feature. Manage your plan in a browser at logit.ie.
        </p>
      {:else}
        {#if clients.length === 0}
          <p class="px-3 py-2 text-sm text-muted-foreground">No clients yet.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each clients as c (c.relationshipId)}
              <li class="flex items-center">
                <button type="button" class="flex-1 min-w-0 px-3 py-3 text-left hover:bg-muted/40"
                  onclick={() => void goto(`/clients/${c.client.id}?u=${c.client.username}`)}>
                  <span class="text-sm font-medium">{c.client.displayName || c.client.username}</span>
                  <p class="text-xs text-muted-foreground mt-0.5">@{c.client.username}</p>
                </button>
                <span class="text-muted-foreground text-sm pr-3">›</span>
              </li>
            {/each}
          </ul>
        {/if}

        <form class="flex gap-2 px-3 py-3" onsubmit={invite}>
          <input type="text" placeholder="Client's username" bind:value={inviteUsername}
            class="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <Button type="submit" size="sm" disabled={ui.inviting || !inviteUsername.trim()}>Invite</Button>
        </form>
        {#if inviteError}<p class="px-3 pb-2 text-sm text-destructive">{inviteError}</p>{/if}

        {#if sent.length > 0}
          <div class="px-3 pb-3">
            <p class="text-xs text-muted-foreground mb-1">Pending invites sent</p>
            {#each sent as inv (inv.relationshipId)}
              <p class="text-sm text-muted-foreground py-0.5">{inv.client.displayName || inv.client.username}</p>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
