<script lang="ts">
  // Accounts on this phone (design canvas 8b): each keeps its own training, settings and
  // sign-in, so switching is one tap with no password. "Add account" signs someone else in
  // alongside; the account in use stays as it is.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { Check, Loader2, Plus } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient } from "@logit/core/api/client";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import { postSwitchDestination, type LocalAccount } from "$lib/data/localAccountRepo";

  type Row = { account: LocalAccount; detail: string; signedIn: boolean };

  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let activeId = $state<string | null>(null);
  let busyId = $state<string | null>(null);
  let adding = $state(false);
  let error = $state<string | null>(null);

  async function describe(account: LocalAccount): Promise<Row> {
    if (!account.serverUserId) return { account, detail: "No account · on this phone only", signedIn: false };
    const s = await apiClient.sessionSummary(account.id);
    if (!s.signedIn) return { account, detail: `Signed out · ${s.server}`, signedIn: false };
    const plan = s.selfHosted ? "Own server" : (s.user?.tier ?? "Free");
    return { account, detail: `${plan} · ${s.server}`, signedIn: true };
  }

  onMount(async () => {
    activeId = getActiveOwnerId();
    try {
      const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
      const all = await listLocalAccounts();
      rows = await Promise.all(all.map(describe));
    } finally {
      loading = false;
    }
  });

  function initials(name: string) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  async function switchTo(account: LocalAccount) {
    if (account.id === activeId) return;
    error = null;
    busyId = account.id;
    try {
      await authStore.loginOfflineAccount(account.id);
      await goto(postSwitchDestination(account, authStore.isAuthenticated));
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't switch. Try again.";
    } finally {
      busyId = null;
    }
  }

  async function addAccount() {
    adding = true;
    try {
      await authStore.beginAddingAccount();
      await goto("/auth?mode=login");
    } finally {
      adding = false;
    }
  }
</script>

{#if loading}
  <div class="flex justify-center py-10"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
{:else}
  <ul class="flex flex-col gap-1.5">
    {#each rows as row (row.account.id)}
      {@const active = row.account.id === activeId}
      <li>
        <button type="button"
          class="w-full min-h-16 flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors {active ? 'bg-muted' : 'hover:bg-muted/60'}"
          aria-current={active ? "true" : undefined}
          disabled={busyId !== null}
          onclick={() => void switchTo(row.account)}>
          <span class="h-11 w-11 shrink-0 overflow-hidden rounded-full flex items-center justify-center text-sm font-semibold {active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/15'}">
            {#if row.account.avatarDataUrl}
              <img src={row.account.avatarDataUrl} alt="" class="h-full w-full object-cover" />
            {:else}
              {initials(row.account.displayName || row.account.username)}
            {/if}
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[15px] font-medium">
              {row.account.displayName || "No name yet"}
              {#if row.account.serverUserId}<span class="font-normal text-muted-foreground"> @{row.account.username}</span>{/if}
            </span>
            <span class="truncate text-[13px] text-muted-foreground">{row.detail}</span>
          </span>
          {#if busyId === row.account.id}
            <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
          {:else if active}
            <Check class="h-5 w-5" aria-label="Current account" />
          {/if}
        </button>
      </li>
    {/each}
    <li>
      <button type="button" class="w-full min-h-16 flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-muted/60"
        disabled={adding} onclick={() => void addAccount()}>
        <span class="h-11 w-11 shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/50 flex items-center justify-center">
          {#if adding}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Plus class="h-5 w-5 text-muted-foreground" />{/if}
        </span>
        <span class="flex flex-col">
          <span class="text-[15px] font-medium">Add account</span>
          <span class="text-[13px] text-muted-foreground">Sign in or create one. Yours stays as it is</span>
        </span>
      </button>
    </li>
  </ul>
  {#if error}<p class="mt-2 px-2 text-sm text-destructive">{error}</p>{/if}
{/if}
