<!-- Delete the account, or everything on this phone when there's no account (design canvas 8):
     what goes, a copy first if wanted, then the password. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { TriangleAlert } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { reveal } from "$lib/transitions";
  import { authStore } from "$lib/api/authStore.svelte";
  import { billing } from "$lib/billing/billing.svelte";
  import { ApiError } from "@logit/core/api/client";

  const { serverHost = "" }: { serverHost?: string } = $props();

  let open = $state(false);
  let deleting = $state(false);
  let password = $state("");
  let error = $state<string | null>(null);
  let localWorkoutCount = $state<number | null>(null);
  let savingCopy = $state(false);
  let copySaved = $state(false);
  const signedIn = $derived(authStore.isAuthenticated && !!authStore.user);

  async function openDelete() {
    open = true;
    copySaved = false;
    void billing.refreshStatus();
    try {
      const { getWorkoutRepo } = await import("$lib/data/repoProvider");
      localWorkoutCount = (await getWorkoutRepo().listAllSessions()).length;
    } catch {
      localWorkoutCount = null;
    }
  }

  function cancel() {
    open = false;
    password = "";
    error = null;
  }

  async function saveCopy() {
    savingCopy = true;
    error = null;
    try {
      const { exportData, downloadExport } = await import("$lib/usecases/exportData");
      await downloadExport(await exportData());
      copySaved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save a copy.";
    } finally {
      savingCopy = false;
    }
  }

  async function confirm() {
    if (authStore.isAuthenticated && !password) {
      error = "Enter your password to delete your account.";
      return;
    }
    deleting = true;
    error = null;
    try {
      await authStore.deleteAccount(password);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Couldn't delete your account — try again.";
      deleting = false;
    }
  }

  const workouts = $derived(localWorkoutCount !== null ? `: ${localWorkoutCount} workout${localWorkoutCount === 1 ? "" : "s"}` : "");
</script>

<section id="delete" class="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card">
  {#if !open}
    <button type="button" class="flex min-h-14 w-full items-center px-3 text-left text-[15px] font-medium text-destructive hover:bg-destructive/5"
      onclick={() => void openDelete()}>
      {signedIn ? "Delete account" : "Delete everything on this phone"}
    </button>
  {:else}
    <div class="flex flex-col gap-3 p-3" transition:reveal>
      {#if signedIn && billing.paysThroughPlay}
        <div class="flex gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 p-3">
          <TriangleAlert class="mt-0.5 size-[18px] shrink-0 text-warning" />
          <div class="flex flex-col gap-2">
            <p class="text-[13px] leading-normal">
              You still pay for <strong>{billing.status?.subscription?.plan}</strong> through Google Play. Deleting your account
              <strong>doesn't cancel it</strong>. Cancel in Google Play first, or you'll keep being charged.
            </p>
            <Button variant="outline" size="sm" class="self-start" onclick={() => void billing.openSubscriptions(billing.status?.subscription?.productId)}>
              Cancel {billing.status?.subscription?.plan} in Google Play
            </Button>
          </div>
        </div>
      {/if}
      <div>
        <p class="text-lg font-bold">{signedIn ? `Delete @${authStore.user?.username}?` : "Delete everything on this phone?"}</p>
        <p class="text-sm text-muted-foreground">This can't be undone.</p>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[10px] bg-destructive/10 p-3 text-sm text-destructive">
        <p class="font-semibold">What goes</p>
        {#if signedIn}
          <p>• Your account and everything on {serverHost}{workouts}, posts, followers, coaching</p>
          <p>• Everything of yours on this phone</p>
        {:else}
          <p>• Everything on this phone{workouts}, splits, food, habits, settings</p>
        {/if}
      </div>
      <Button variant="outline" size="sm" class="self-start" disabled={savingCopy || deleting} onclick={() => void saveCopy()}>
        {#if savingCopy}<Spinner class="mr-1.5 h-3.5 w-3.5" />{/if}
        {copySaved ? "Copy saved" : "Save a copy first"}
      </Button>
      {#if signedIn}
        <input type="password" placeholder="Confirm your password" autocomplete="current-password" aria-label="Confirm your password"
          class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={password} />
      {/if}
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
      <div class="flex gap-2">
        <Button variant="outline" size="sm" class="border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50"
          disabled={deleting} onclick={() => void confirm()}>
          {#if deleting}<Spinner class="mr-1.5 h-3.5 w-3.5" />{/if}
          {signedIn ? "Delete account" : "Delete everything on this phone"}
        </Button>
        <Button variant="outline" size="sm" disabled={deleting} onclick={cancel}>Cancel</Button>
      </div>
    </div>
  {/if}
</section>
