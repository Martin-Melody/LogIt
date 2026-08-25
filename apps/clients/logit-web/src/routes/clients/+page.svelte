<script lang="ts">
  import { apiClient, ApiError } from "@logit/core/api/client";
  import {
    coachApi,
    type ClientRelationship,
    type ReceivedInvite,
    type SentInvite,
  } from "@logit/core/api/coachApi";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { viewingClient } from "$lib/viewingClient.svelte";

  const isStudio = $derived(apiClient.getUser()?.tier === "Studio");

  let loading = $state(true);
  let error = $state<string | null>(null);

  let clients = $state<ClientRelationship[]>([]);
  let received = $state<ReceivedInvite[]>([]);
  let sent = $state<SentInvite[]>([]);

  let inviteUsername = $state("");
  let inviteError = $state<string | null>(null);
  let inviting = $state(false);

  let busyId = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const [receivedRes, clientsRes, sentRes] = await Promise.all([
        coachApi.listReceivedInvites(),
        isStudio ? coachApi.listClients() : Promise.resolve([]),
        isStudio ? coachApi.listSentInvites() : Promise.resolve([]),
      ]);
      received = receivedRes;
      clients = clientsRes;
      sent = sentRes;
      viewingClient.setClients(clientsRes);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load clients";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  async function invite(e: Event) {
    e.preventDefault();
    const username = inviteUsername.trim();
    if (!username) return;
    inviting = true;
    inviteError = null;
    try {
      await coachApi.inviteClient(username);
      inviteUsername = "";
      await load();
    } catch (e) {
      inviteError =
        e instanceof ApiError
          ? e.message
          : "Failed to send invite — check the username and try again.";
    } finally {
      inviting = false;
    }
  }

  async function accept(relationshipId: string) {
    busyId = relationshipId;
    try {
      await coachApi.acceptInvite(relationshipId);
      await load();
    } finally {
      busyId = null;
    }
  }

  async function decline(relationshipId: string) {
    busyId = relationshipId;
    try {
      await coachApi.declineInvite(relationshipId);
      await load();
    } finally {
      busyId = null;
    }
  }

  async function revoke(relationshipId: string) {
    busyId = relationshipId;
    try {
      await coachApi.revokeRelationship(relationshipId);
      await load();
    } finally {
      busyId = null;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-lg font-semibold">Clients</h1>

  {#if loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else if error}
    <p class="text-sm text-destructive">{error}</p>
  {:else}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Coach invites</Card.Title>
        <Card.Description>Trainers who've invited you to share your data with them.</Card.Description>
      </Card.Header>
      <Card.Content class="pt-0 pb-2">
        {#if received.length === 0}
          <p class="text-sm text-muted-foreground py-2">No pending invites.</p>
        {:else}
          {#each received as inv (inv.relationshipId)}
            <div class="flex items-center justify-between py-1.5 border-b last:border-0 border-border text-sm">
              <span>{inv.coach.displayName || inv.coach.username}</span>
              <div class="flex gap-2">
                <Button size="sm" disabled={busyId === inv.relationshipId} onclick={() => accept(inv.relationshipId)}>
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === inv.relationshipId}
                  onclick={() => decline(inv.relationshipId)}
                >
                  Decline
                </Button>
              </div>
            </div>
          {/each}
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>My clients</Card.Title>
        {#if !isStudio}
          <Card.Description>
            Inviting clients is a Studio-tier feature — upgrade to manage clients from here.
          </Card.Description>
        {/if}
      </Card.Header>
      <Card.Content class="pt-0 pb-3 flex flex-col gap-3">
        {#if isStudio}
          {#if clients.length === 0}
            <p class="text-sm text-muted-foreground py-2">No clients yet.</p>
          {:else}
            {#each clients as c (c.relationshipId)}
              <div class="flex items-center justify-between py-1.5 border-b last:border-0 border-border text-sm">
                <span>{c.client.displayName || c.client.username}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === c.relationshipId}
                  onclick={() => revoke(c.relationshipId)}
                >
                  Revoke
                </Button>
              </div>
            {/each}
          {/if}

          <form class="flex gap-2 pt-2" onsubmit={invite}>
            <input
              type="text"
              placeholder="Client's username"
              class="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={inviteUsername}
            />
            <Button type="submit" size="sm" disabled={inviting || !inviteUsername.trim()}>
              {#if inviting}<Spinner class="size-4" />{/if}
              Invite
            </Button>
          </form>
          {#if inviteError}
            <p class="text-sm text-destructive">{inviteError}</p>
          {/if}

          {#if sent.length > 0}
            <div class="pt-2">
              <p class="text-xs text-muted-foreground mb-1">Pending invites sent</p>
              {#each sent as inv (inv.relationshipId)}
                <div class="flex items-center justify-between py-1 text-sm">
                  <span class="text-muted-foreground">{inv.client.displayName || inv.client.username}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
