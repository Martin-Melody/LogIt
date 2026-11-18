<!-- Account › Where you're signed in: every phone and browser with a session, and signing one
     out (server Features/Auth/SessionEndpoints.cs). A signed-out device stops working within
     about 15 minutes, when its current access token runs out. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { apiClient, type SignedInSession } from "@logit/core/api/client";
  import * as Card from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";

  let sessions = $state<SignedInSession[] | null>(null);
  let failed = $state(false);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      sessions = await apiClient.listSessions();
      failed = false;
    } catch {
      failed = true;
    }
  }
  onMount(load);

  async function signOut(s: SignedInSession) {
    busy = s.id;
    try {
      await apiClient.signOutSession(s.id);
      toast.success(`Signed out ${s.label}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign it out");
    } finally {
      busy = null;
    }
  }

  function when(iso: string): string {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Where you're signed in</Card.Title>
    <Card.Description>Phones and browsers with your account. Sign out any you don't recognise, then change your password.</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if failed}
      <p class="text-sm text-muted-foreground">Couldn't load the list. This server may be older than this page.</p>
    {:else if !sessions}
      <Skeleton class="h-24" />
    {:else}
      <ul class="flex flex-col">
        {#each sessions as s (s.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-sm font-medium">{s.label}{#if s.current}<span class="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">This browser</span>{/if}</span>
              <span class="text-xs text-muted-foreground">Signed in {when(s.startedAt)} · last active {when(s.lastActiveAt)}</span>
            </div>
            {#if !s.current}
              <button type="button" disabled={busy === s.id} onclick={() => void signOut(s)}
                class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                {busy === s.id ? "Signing out…" : "Sign out"}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
