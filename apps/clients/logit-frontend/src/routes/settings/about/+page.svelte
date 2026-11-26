<!-- Settings › About: policies and diagnostics; in a dev build, the reset tools too. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { goto } from "$app/navigation";
  import { ChevronRight, ExternalLink, RotateCcw, Trash2 } from "lucide-svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import { Button } from "$lib/components/ui/button";
  import { PRIVACY_URL, TERMS_URL } from "$lib/constants/urls";
  import { log } from "@logit/core/platform/log";
  import { authStore } from "$lib/api/authStore.svelte";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours } from "$lib/tour/index";
  import { clearAllData } from "$lib/usecases/clearAllData";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import type { LocalAccount } from "$lib/data/localAccountRepo";

  const isDev = import.meta.env.DEV;

  async function resetOnboarding() {
    resetTours();
    onboarding.reset();
    await goto("/onboarding");
  }

  async function clearAllDataAndAccount() {
    // Dev only: no password to ask for, so this only works where the server allows it.
    try {
      await authStore.deleteAccount("");
    } catch {}
    await clearAllData();
  }

  // --- Dev: local accounts ---
  let localAccounts = $state<LocalAccount[]>([]);
  let deletingAccountId = $state<string | null>(null);
  $effect(() => {
    if (isDev && isNativePlatform()) {
      void (async () => {
        try {
          const { listLocalAccounts } = await import("$lib/data/localAccountRepo");
          localAccounts = await listLocalAccounts();
        } catch {}
      })();
    }
  });

  async function deleteLocalAccount(id: string) {
    if (deletingAccountId) return;
    deletingAccountId = id;
    try {
      const { clearOwnerData, getDb } = await import("$lib/data/db/sqlite");
      await clearOwnerData(id);
      await getDb().run(`DELETE FROM local_accounts WHERE id = ?`, [id]);
      localAccounts = localAccounts.filter((a) => a.id !== id);
      if (getActiveOwnerId() === id) await authStore.logout();
    } catch (e) {
      log.error("accounts", "Could not delete local account", e);
    } finally {
      deletingAccountId = null;
    }
  }
</script>

<SettingsPage title="About">
  <SettingsSection note="LogIt is open source. Self-hosting is always free.">
    <a href={PRIVACY_URL} target="_blank" rel="noreferrer" class="{settingRow} text-inherit no-underline hover:bg-muted/40">
      <span class="flex-1 text-[15px] font-medium">Privacy policy</span><ExternalLink class="size-4 text-muted-foreground" />
    </a>
    <a href={TERMS_URL} target="_blank" rel="noreferrer" class="{settingRow} text-inherit no-underline hover:bg-muted/40">
      <span class="flex-1 text-[15px] font-medium">Terms of service</span><ExternalLink class="size-4 text-muted-foreground" />
    </a>
    <a href="/settings/diagnostics" class="{settingRow} text-inherit no-underline hover:bg-muted/40">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-medium">Diagnostics</span>
        <span class="text-[13px] text-muted-foreground">Send a report when something goes wrong</span>
      </span>
      <ChevronRight class="size-4 text-muted-foreground" />
    </a>
  </SettingsSection>

  {#if isDev}
    <SettingsSection title="Developer" note="Reset app state for testing. Dev builds only.">
      <div class="flex flex-col gap-2 p-3">
        <Button variant="outline" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => void resetOnboarding()}>
          <RotateCcw class="mr-2 h-3.5 w-3.5" /> Reset onboarding
        </Button>
        <Button variant="outline" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => resetTours()}>
          <RotateCcw class="mr-2 h-3.5 w-3.5" /> Reset tours
        </Button>
        <Button variant="outline" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10" onclick={() => void clearAllData()}>
          <RotateCcw class="mr-2 h-3.5 w-3.5" /> Clear all data & databases
        </Button>
        <Button variant="outline" class="justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!authStore.isAuthenticated} onclick={() => void clearAllDataAndAccount()}>
          <RotateCcw class="mr-2 h-3.5 w-3.5" /> Clear all data & delete API account
        </Button>
        {#if isNativePlatform() && localAccounts.length > 0}
          <p class="pt-2 text-xs text-muted-foreground">Local accounts on this device</p>
          {#each localAccounts as account (account.id)}
            <div class="flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium">{account.displayName || account.username}</p>
                <p class="text-[11px] text-muted-foreground">
                  {account.serverUserId ? "linked to online account" : account.passwordHash ? "password protected" : "no password"}
                  {getActiveOwnerId() === account.id ? " · active" : ""}
                </p>
              </div>
              <button type="button" class="flex size-11 shrink-0 items-center justify-center text-destructive/60 transition-colors hover:text-destructive disabled:opacity-40"
                disabled={deletingAccountId === account.id} onclick={() => void deleteLocalAccount(account.id)} aria-label="Delete account">
                {#if deletingAccountId === account.id}<Spinner class="h-3.5 w-3.5" />{:else}<Trash2 class="h-3.5 w-3.5" />{/if}
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </SettingsSection>
  {/if}
</SettingsPage>
