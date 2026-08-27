<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, Plus, Eye, EyeOff, Loader2, Check } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import type { LocalAccount } from "$lib/data/localAccountRepo";

  let accounts = $state<LocalAccount[]>([]);
  let loading = $state(true);
  let activeId = $state<string | null>(null);

  let selectedId = $state<string | null>(null);
  let password = $state("");
  let showPassword = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let creating = $state(false);

  onMount(async () => {
    if (!isNativePlatform()) {
      // Web has no local-account infrastructure — nothing to switch between.
      await goto("/settings", { replaceState: true });
      return;
    }
    activeId = getActiveOwnerId();
    try {
      const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
      accounts = await listLocalAccounts();
    } finally {
      loading = false;
    }
  });

  function initials(name: string) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function select(account: LocalAccount) {
    if (account.id === activeId) return;
    selectedId = selectedId === account.id ? null : account.id;
    password = "";
    error = null;
  }

  async function switchTo(account: LocalAccount) {
    error = null;
    busy = true;
    try {
      await authStore.loginOfflineAccount(account.id, password);
      await goto("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not switch profile.";
    } finally {
      busy = false;
    }
  }

  async function addProfile() {
    creating = true;
    try {
      await authStore.createOfflineAccount("", "");
      await goto("/onboarding");
    } finally {
      creating = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
  <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => history.back()}>
    <ArrowLeft class="h-4 w-4" /> Back
  </button>

  <h1 class="text-xl font-bold mb-1">Profiles on this device</h1>
  <p class="text-xs text-muted-foreground mb-5">Each profile keeps its own workouts, splits, and settings.</p>

  {#if loading}
    <div class="flex justify-center py-10">
      <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  {:else}
    <ul class="flex flex-col gap-2 flex-1">
      {#each accounts as account (account.id)}
        <li class="rounded border transition-colors {selectedId === account.id ? 'border-primary bg-primary/5' : 'border-border'}">
          <button type="button"
            class="w-full text-left px-4 py-3"
            onclick={() => select(account)}>
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
                {#if account.avatarDataUrl}
                  <img src={account.avatarDataUrl} alt={account.displayName} class="h-full w-full object-cover" />
                {:else}
                  {initials(account.displayName || account.username)}
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{account.displayName || account.username}</p>
                <p class="text-[10px] text-muted-foreground">
                  {account.serverUserId ? "Synced account" : account.passwordHash ? "Password protected" : "Local only"}
                </p>
              </div>
              {#if account.id === activeId}
                <span class="flex items-center gap-1 text-[10px] text-primary shrink-0"><Check class="h-3.5 w-3.5" /> Active</span>
              {/if}
            </div>
          </button>

          {#if selectedId === account.id && account.id !== activeId}
            <div class="px-4 pb-3 flex flex-col gap-2">
              {#if account.passwordHash}
                <div class="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autocomplete="current-password"
                    class="w-full rounded border border-border bg-background px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-ring"
                    bind:value={password}
                    onkeydown={(e) => { if (e.key === "Enter") void switchTo(account); }} />
                  <button type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onclick={() => (showPassword = !showPassword)}>
                    {#if showPassword}<EyeOff class="h-3.5 w-3.5" />{:else}<Eye class="h-3.5 w-3.5" />{/if}
                  </button>
                </div>
              {/if}
              {#if error}
                <p class="text-xs text-destructive">{error}</p>
              {/if}
              <button type="button"
                class="w-full py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={busy || (!!account.passwordHash && !password)}
                onclick={() => void switchTo(account)}>
                {#if busy}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
                {busy ? "Switching…" : "Switch to this profile"}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <button type="button"
      class="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 rounded border border-dashed border-border text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors disabled:opacity-50"
      disabled={creating}
      onclick={() => void addProfile()}>
      {#if creating}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Plus class="h-4 w-4" />{/if}
      Add another profile
    </button>
  {/if}
</div>
