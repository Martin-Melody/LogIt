<!-- On the dashboard home while this server has no admin: the signed-in account can become the
     admin with the server's ADMIN_KEY. "Not now" hides it on this browser. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { apiClient } from "@logit/core/api/client";
  import { reveal } from "$lib/transitions";
  import { adminApi } from "./adminApi";
  import { adminState } from "./adminState.svelte";

  const hideKey = `logit:admin-claim-hidden:${apiClient.getUser()?.id ?? ""}`;
  const host = (() => { try { return new URL(apiClient.getBaseUrl()).host; } catch { return "this server"; } })();

  let hidden = $state(true);
  let key = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let done = $state(false);

  onMount(() => {
    try { hidden = localStorage.getItem(hideKey) === "1"; } catch { hidden = false; }
  });

  function notNow() {
    hidden = true;
    try { localStorage.setItem(hideKey, "1"); } catch { /* hidden for this visit */ }
  }

  async function claim(e: Event) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await adminApi.claim(key.trim());
      done = true;
      key = "";
      await adminState.refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't make you the admin";
    } finally {
      busy = false;
    }
  }
</script>

{#if done}
  <section transition:reveal aria-labelledby="claimed" class="flex flex-wrap items-center gap-4 rounded-[14px] border border-success/30 bg-card p-5">
    <div class="min-w-0 flex-[1_1_320px]">
      <h2 id="claimed" class="text-[15px] font-semibold">You're the admin of {host}</h2>
      <p class="text-[13px] text-muted-foreground">Admin is in the menu under your name. You can make other people admins from their page.</p>
    </div>
    <button type="button" onclick={() => goto("/admin")} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Open admin</button>
  </section>
{:else if adminState.claimOffered && !hidden}
  <section transition:reveal aria-labelledby="claim" class="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5">
    <div>
      <h2 id="claim" class="text-[15px] font-semibold">Make this account the admin of {host}</h2>
      <p class="text-[13px] text-muted-foreground">Nobody looks after this server yet. The admin invites people, resets passwords and handles reports.</p>
    </div>
    <form class="flex flex-col gap-3" onsubmit={claim}>
      <label class="flex max-w-md flex-col gap-1.5 text-[13px] font-medium">Admin key
        <input type="password" bind:value={key} required autocomplete="off" aria-invalid={error ? "true" : undefined} aria-describedby="claim-help"
          class="h-9 rounded-[9px] border bg-background px-2.5 text-sm {error ? 'border-destructive' : 'border-input'}" />
      </label>
      <p id="claim-help" class="text-[13px] {error ? 'text-destructive' : 'text-muted-foreground'}">
        {#if error}{error} Check for a space at either end.{:else}It's <code class="rounded bg-muted px-1 text-xs">ADMIN_KEY</code> in the .env file next to docker-compose.yml.{/if}
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !key.trim()} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Make me the admin</button>
        <button type="button" onclick={notNow} class="h-9 rounded-[9px] bg-muted px-3.5 text-[13px] font-medium hover:bg-accent">Not now</button>
      </div>
    </form>
  </section>
{/if}
