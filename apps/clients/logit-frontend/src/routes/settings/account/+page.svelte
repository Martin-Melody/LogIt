<!-- Settings › Account: who's signed in, backup and plan, coaching, sign-in, signing out and deleting. -->
<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronRight, Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import DeleteAccountPanel from "$lib/features/settings/DeleteAccountPanel.svelte";
  import PlanCard from "$lib/components/billing/PlanCard.svelte";
  import ConnectionDot from "$lib/components/ConnectionDot.svelte";
  import { Button } from "$lib/components/ui/button";
  import { reveal } from "$lib/transitions";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { connectionStatus } from "@logit/core/api/connectionStatus.svelte";
  import { getServerMode } from "@logit/core/api/serverConfig";
  import { profile } from "$lib/stores/profile.store";
  import { syncAll, pushAllLocalData, lastSyncedAt, syncRunning, planIncludesSync, markFullUploadDue } from "$lib/sync/syncService";
  import { outboxSize } from "$lib/sync/outbox";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { replayTour } from "$lib/tour/index";

  // --- Sync ---
  let syncing = $state(false);
  async function manualSync() {
    if (syncing) return;
    syncing = true;
    try {
      // Also push everything local, not just pull — covers accounts that signed in
      // before local history was ever fully backfilled to the server.
      await pushAllLocalData();
      const ok = await syncAll();
      if (!ok) toast.error("Couldn't sync — some data didn't reach the server. Try again shortly, or see Settings › About › Diagnostics for what failed.");
    } finally {
      syncing = false;
    }
  }

  function formatLastSynced(ms: number): string {
    if (!ms) return "Never synced";
    const diff = Date.now() - ms;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ms).toLocaleDateString();
  }

  // --- Account ---
  const serverMode = getServerMode();
  // The server the account in use lives on, as people know it.
  const serverHost = $derived.by(() => {
    if (serverMode !== "selfhosted") return "getlogit.app";
    try { return new URL(apiClient.getBaseUrl()).host; } catch { return "Your own server"; }
  });
  // What the account card says about backup (design canvas 6). Free accounts back up one phone
  // (the one they last signed in on); self-hosted servers include everything.
  // Changes not on the server yet: the last good sync alone said "Backed up · synced just now"
  // while the server was unreachable (bug hunt 15.1). Re-read whenever a sync starts or ends.
  const waiting = $derived.by(() => {
    void [$syncRunning, $lastSyncedAt, connectionStatus.state];
    return outboxSize();
  });
  const waitingText = $derived(`${waiting} change${waiting === 1 ? "" : "s"} waiting`);
  const backupElsewhere = $derived(!!authStore.user && authStore.user.tier === "Free" && !apiClient.isSelfHosted() && apiClient.isBackupElsewhere());
  let movingBackup = $state(false);
  async function moveBackupHere() {
    movingBackup = true;
    try { await apiClient.moveBackupHere(); markFullUploadDue(); await syncAll().catch(() => {}); } catch {} finally { movingBackup = false; }
  }
  const backupLine = $derived(
    backupElsewhere
      ? "Your free backup is on your other phone. Move it here, or get Pro to back up both"
      : connectionStatus.state === "disconnected"
        ? `Can't reach the server${waiting ? ` · ${waitingText}, kept on this phone` : ""}`
      : waiting && !$syncRunning
        ? `${waitingText} to back up`
      : $lastSyncedAt
        ? `Backed up · synced ${formatLastSynced($lastSyncedAt).toLowerCase()}`
        : "Not backed up yet",
  );
  function initialsOf(name: string): string {
    return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  // Sign out of one account on the phone (design canvas 7). Plain "Sign out" takes its training
  // off the phone, so it's only offered as-is when everything is backed up; otherwise a copy is
  // saved first. "Keep using it here" keeps the training as the phone's space without an account.
  let signOutSheet = $state<{ backedUp: boolean; canKeepHere: boolean } | null>(null);
  let signingOut = $state(false);
  let signOutError = $state<string | null>(null);
  async function openSignOut() {
    if (!isNativePlatform()) {
      void authStore.logout();
      return;
    }
    const { everythingBackedUp } = await import("$lib/sync/syncService");
    signOutError = null;
    signOutSheet = { backedUp: everythingBackedUp(), canKeepHere: await authStore.canKeepHere() };
  }
  async function confirmSignOut(choice: "remove" | "keep-here") {
    if (!signOutSheet) return;
    signingOut = true;
    signOutError = null;
    try {
      if (choice === "remove" && !signOutSheet.backedUp) {
        const { exportData, downloadExport } = await import("$lib/usecases/exportData");
        await downloadExport(await exportData());
      }
      await authStore.signOutOfAccount({ keepHere: choice === "keep-here" });
    } catch (e) {
      signOutError = e instanceof Error ? e.message : "Couldn't sign out. Try again.";
      signingOut = false;
    }
  }

  // --- Password ---
  let showPasswordForm = $state(false);
  let passwordForm = $state({ current: "", next: "", confirm: "" });
  let passwordError = $state<string | null>(null);
  let savingPassword = $state(false);
  async function savePassword() {
    passwordError = null;
    if (passwordForm.next !== passwordForm.confirm) {
      passwordError = "Passwords don't match.";
      return;
    }
    if (!passwordForm.current.trim()) {
      passwordError = "Enter your current password to continue.";
      return;
    }
    savingPassword = true;
    try {
      await apiClient.changePassword(passwordForm.current, passwordForm.next);
      showPasswordForm = false;
      passwordForm = { current: "", next: "", confirm: "" };
    } catch (e) {
      passwordError = e instanceof ApiError ? e.message : "Failed to update password.";
    } finally {
      savingPassword = false;
    }
  }

  onMount(() => {
    if (authStore.isAuthenticated) connectionStatus.startPolling();
    const t = setTimeout(() => replayTour("phone.sync"), 600);
    return () => clearTimeout(t);
  });

  const linkRow = `${settingRow} w-full text-left text-inherit no-underline hover:bg-muted/40`;
  const input = "h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<SettingsPage title="Account">
  {#if authStore.isAuthenticated && authStore.user}
    <!-- Who's signed in (design canvas 6) -->
    <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
      <div class="flex items-center gap-3">
        <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-base font-semibold">
          {#if $profile.avatarDataUrl}
            <img src={photoSrc($profile.avatarDataUrl)} alt="" class="size-full object-cover" />
          {:else}
            {initialsOf($profile.name || authStore.user.username)}
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-semibold">{$profile.name || authStore.user.username} <span class="font-normal text-muted-foreground">@{authStore.user.username}</span></p>
          <p class="truncate text-[13px] text-muted-foreground">{serverHost}</p>
        </div>
        <span class="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{apiClient.isSelfHosted() ? "Own server" : authStore.user.tier}</span>
      </div>
      <div class="flex items-center gap-2">
        <p class="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-muted-foreground"><ConnectionDot /> {backupLine}</p>
        {#if authStore.user.tier !== "Free" || planIncludesSync()}
          <Button id="settings-sync" data-guide="settings-sync" variant="outline" size="sm" class="shrink-0"
            disabled={syncing || serverMode === "offline"} onclick={() => void manualSync()}>
            {#if syncing}<Loader2 class="size-3.5 animate-spin" />{/if}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        {/if}
      </div>
      {#if backupElsewhere}
        <Button variant="outline" class="h-11 w-fit" disabled={movingBackup} onclick={() => void moveBackupHere()}>
          {movingBackup ? "Moving…" : "Move backup here"}
        </Button>
      {/if}
    </div>

    <section id="plan" class="scroll-mt-4 rounded-xl border border-border bg-card px-3.5 [&>div]:border-t-0">
      <PlanCard />
    </section>

    <SettingsSection>
      <a id="coaching" href="/clients" class={linkRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Coaching</span>
          <span class="text-[13px] text-muted-foreground">{apiClient.isSelfHosted() ? "View invites, or manage your clients" : "View invites, or manage clients on a Studio plan"}</span>
        </span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </a>
      <a id="computer" href="/settings/computer" class={linkRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Sign in on a computer</span>
          <span class="text-[13px] text-muted-foreground">Scan the code on {apiClient.isSelfHosted() ? "your server's dashboard" : "app.getlogit.app"}, and see where you're signed in</span>
        </span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </a>
    </SettingsSection>

    <SettingsSection title="Sign-in">
      <div id="password" class="scroll-mt-4">
        <button type="button" class={linkRow} aria-expanded={showPasswordForm}
          onclick={() => { showPasswordForm = !showPasswordForm; passwordError = null; passwordForm = { current: "", next: "", confirm: "" }; }}>
          <span class="flex-1 text-[15px] font-medium">Change password</span>
          <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform {showPasswordForm ? 'rotate-90' : ''}" />
        </button>
        {#if showPasswordForm}
          <div class="flex flex-col gap-2 px-3 pb-3" transition:reveal>
            <input type="password" placeholder="Current password" aria-label="Current password" autocomplete="current-password" class={input} bind:value={passwordForm.current} />
            <input type="password" placeholder="New password" aria-label="New password" autocomplete="new-password" class={input} bind:value={passwordForm.next} />
            <input type="password" placeholder="Confirm new password" aria-label="Confirm new password" autocomplete="new-password" class={input} bind:value={passwordForm.confirm} />
            {#if passwordError}<p class="text-xs text-destructive">{passwordError}</p>{/if}
            <div class="flex gap-2 pt-1">
              <Button size="sm" disabled={savingPassword} onclick={() => void savePassword()}>{savingPassword ? "Saving…" : "Save"}</Button>
              <Button variant="ghost" size="sm" onclick={() => { showPasswordForm = false; passwordError = null; }}>Cancel</Button>
            </div>
          </div>
        {/if}
      </div>
      {#if isNativePlatform()}
        <a id="switch-account" href="/accounts" class={linkRow}>
          <span class="flex-1 text-[15px] font-medium">Switch or add account</span>
          <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
        </a>
        <a id="move-server" href="/settings/move-server" class={linkRow}>
          <span class="flex-1 text-[15px] font-medium">Move to another server</span>
          <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
        </a>
      {/if}
      <button id="sign-out" type="button" class={linkRow} onclick={() => void openSignOut()}>
        <span class="flex-1 text-[15px] font-medium">Sign out of @{authStore.user.username}</span>
      </button>
    </SettingsSection>


    <div class="flex flex-col gap-2">
      <DeleteAccountPanel {serverHost} />
      <p class="px-1 text-[13px] leading-snug text-muted-foreground">
        {apiClient.isSelfHosted() ? `Whoever runs ${serverHost}` : "The LogIt team"} can see your name, email, devices and plan, not your workouts. You get an email if they change your account.
      </p>
    </div>
  {:else if getActiveOwnerId()}
    <!-- No account yet (design canvas 5) -->
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-base font-semibold">
        {#if $profile.avatarDataUrl}
          <img src={photoSrc($profile.avatarDataUrl)} alt="" class="size-full object-cover" />
        {:else}
          {initialsOf($profile.name)}
        {/if}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-semibold">{$profile.name || "No name yet"}</p>
        <p class="text-[13px] text-muted-foreground">On this phone only · not backed up</p>
      </div>
    </div>
    <div class="flex flex-col gap-3 rounded-xl bg-muted p-4">
      <p class="text-[15px] font-semibold">Make an account</p>
      <div class="flex flex-col gap-2 text-sm">
        <p class="flex gap-2.5"><span class="min-w-11 font-semibold">Free</span><span class="text-muted-foreground">Back up this phone, train with friends, get coached</span></p>
        <p class="flex gap-2.5"><span class="min-w-11 font-semibold">Pro</span><span class="text-muted-foreground">Sync every phone, the web dashboard</span></p>
      </div>
      <p class="text-xs text-muted-foreground">Everything already on this phone comes with you.</p>
      <div class="flex gap-2">
        <Button class="flex-1" onclick={() => goto("/auth?mode=register")}>Create account</Button>
        <Button class="flex-1" variant="outline" onclick={() => goto("/auth?mode=login")}>Sign in</Button>
      </div>
    </div>
    <SettingsSection>
      <a id="switch-account" href="/accounts" class={linkRow}>
        <span class="flex-1 text-[15px] font-medium">Switch or add account</span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </a>
    </SettingsSection>
  {:else}
    <!-- No account -->
    <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
      <p class="text-sm text-muted-foreground">Not signed in — all data is stored locally on this device.</p>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={() => goto("/auth?mode=login")}>Log in</Button>
        <Button variant="outline" size="sm" onclick={() => goto("/auth?mode=register")}>Create account</Button>
        {#if isNativePlatform()}
          <Button variant="outline" size="sm" onclick={() => goto("/accounts")}>Switch or add account</Button>
        {/if}
      </div>
    </div>
  {/if}
</SettingsPage>

{#if signOutSheet && authStore.user}
  {@const who = authStore.user.username}
  <div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" role="presentation">
    <div class="flex flex-col gap-4 rounded-t-2xl bg-background px-6 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby="signout-title">
      <div class="h-1 w-10 self-center rounded-full bg-muted-foreground/30"></div>
      <div>
        <h2 id="signout-title" class="text-lg font-bold">Sign out of @{who} on this phone?</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {#if signOutSheet.backedUp}
            Everything is backed up on {serverHost}. @{who}'s training leaves this phone, and you can sign back in any time. Other accounts here aren't touched.
          {:else}
            @{who}'s training is only on this phone. Save a copy before it leaves, or keep using it here.
          {/if}
        </p>
      </div>
      <div class="flex flex-col gap-2.5">
        <Button class="h-12" disabled={signingOut} onclick={() => void confirmSignOut("remove")}>
          {#if signingOut}<Loader2 class="h-4 w-4 animate-spin" />{/if}
          {signOutSheet.backedUp ? "Sign out" : "Save a copy, then sign out"}
        </Button>
        {#if signOutSheet.canKeepHere}
          <button type="button" class="flex flex-col items-start gap-0.5 rounded-lg border border-border px-3.5 py-3 text-left" disabled={signingOut} onclick={() => void confirmSignOut("keep-here")}>
            <span class="text-[15px] font-medium">Keep using it here without the account</span>
            <span class="text-sm text-muted-foreground">Your training stays on this phone, offline</span>
          </button>
        {/if}
        <button type="button" class="h-11 text-sm font-medium text-muted-foreground" disabled={signingOut} onclick={() => (signOutSheet = null)}>Cancel</button>
        {#if signOutError}<p class="text-sm text-destructive">{signOutError}</p>{/if}
      </div>
    </div>
  </div>
{/if}
