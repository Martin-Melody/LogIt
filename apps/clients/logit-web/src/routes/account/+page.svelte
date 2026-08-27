<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError, type BillingStatus } from "@logit/core/api/client";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";

  const user = $derived(apiClient.getUser());
  const isSelfHosted = apiClient.isSelfHosted();

  // Falls back to the live Cloudflare Pages URL so this works out of the box; set
  // VITE_MARKETING_URL at build time once logit.ie is live.
  const PRICING_URL: string = `${import.meta.env.VITE_MARKETING_URL || "https://logit-marketing.pages.dev"}/pricing`;

  let billing = $state<BillingStatus | null>(null);
  let billingLoading = $state(!isSelfHosted);
  let portalLoading = $state(false);
  let portalError = $state<string | null>(null);

  $effect(() => {
    if (isSelfHosted) return;
    void (async () => {
      try {
        billing = await apiClient.getBillingStatus();
      } catch {
        // Non-fatal — the page still works without billing details.
      } finally {
        billingLoading = false;
      }
    })();
  });

  async function openBillingPortal() {
    portalLoading = true;
    portalError = null;
    try {
      const url = await apiClient.createBillingPortalSession(`${location.origin}/account`);
      location.href = url;
    } catch (e) {
      portalError = e instanceof ApiError ? e.message : "Couldn't open billing portal.";
      portalLoading = false;
    }
  }

  // --- Display name ---
  let displayName = $state(apiClient.getUser()?.displayName ?? "");
  let savingName = $state(false);
  let nameSaved = $state(false);

  async function saveDisplayName() {
    if (!displayName.trim()) return;
    savingName = true;
    nameSaved = false;
    try {
      await apiClient.updateDisplayName(displayName.trim());
      nameSaved = true;
    } finally {
      savingName = false;
    }
  }

  // --- Change password ---
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let passwordError = $state<string | null>(null);
  let passwordSaved = $state(false);
  let savingPassword = $state(false);

  async function changePassword(e: Event) {
    e.preventDefault();
    passwordError = null;
    passwordSaved = false;
    if (newPassword !== confirmPassword) {
      passwordError = "Passwords don't match.";
      return;
    }
    savingPassword = true;
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
      passwordSaved = true;
    } catch (e) {
      passwordError = e instanceof ApiError ? e.message : "Failed to update password.";
    } finally {
      savingPassword = false;
    }
  }

  // --- Delete account ---
  let confirmingDelete = $state(false);
  let deleting = $state(false);
  let deletePassword = $state("");
  let deleteError = $state<string | null>(null);

  async function deleteAccount() {
    if (!deletePassword) return;
    deleting = true;
    deleteError = null;
    try {
      await apiClient.deleteAccount(deletePassword);
      await goto("/login");
    } catch (e) {
      deleteError = e instanceof ApiError ? e.message : "Couldn't delete your account.";
      deleting = false;
    }
  }
</script>

<div class="max-w-xl mx-auto flex flex-col gap-4">
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title>Profile</Card.Title>
      <Card.Description>@{user?.username}</Card.Description>
    </Card.Header>
    <Card.Content class="pt-0 pb-3 flex flex-col gap-2">
      <div class="flex flex-col gap-1.5 max-w-xs">
        <label for="display-name" class="text-sm font-medium">Display name</label>
        <input
          id="display-name"
          type="text"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={displayName}
        />
      </div>
      <div class="flex items-center gap-2">
        <Button size="sm" disabled={savingName || !displayName.trim()} onclick={() => void saveDisplayName()}>
          {savingName ? "Saving…" : "Save"}
        </Button>
        {#if nameSaved}<span class="text-xs text-muted-foreground">Saved.</span>{/if}
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title>Plan</Card.Title>
    </Card.Header>
    <Card.Content class="pt-0 pb-3 flex flex-col gap-3">
      {#if isSelfHosted}
        <p class="text-sm text-muted-foreground">Self-hosted — full access, no billing.</p>
      {:else if billingLoading}
        <Spinner class="size-4 text-muted-foreground" />
      {:else}
        <p class="text-sm">{user?.tier ?? "Free"} plan</p>
        {#if user?.tier === "Free"}
          <a
            href={PRICING_URL}
            class="inline-flex items-center justify-center self-start rounded bg-primary text-primary-foreground text-sm font-medium px-3 py-2"
          >
            Upgrade to Pro or Studio
          </a>
        {:else}
          <Button size="sm" disabled={portalLoading} onclick={() => void openBillingPortal()}>
            {portalLoading ? "Opening…" : "Manage subscription"}
          </Button>
          {#if portalError}<p class="text-xs text-destructive">{portalError}</p>{/if}
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title>Change password</Card.Title>
    </Card.Header>
    <Card.Content class="pt-0 pb-3">
      <form class="flex flex-col gap-2 max-w-xs" onsubmit={changePassword}>
        <input
          type="password"
          placeholder="Current password"
          autocomplete="current-password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={currentPassword}
        />
        <input
          type="password"
          placeholder="New password"
          autocomplete="new-password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={newPassword}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autocomplete="new-password"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={confirmPassword}
        />
        {#if passwordError}<p class="text-xs text-destructive">{passwordError}</p>{/if}
        {#if passwordSaved}<p class="text-xs text-muted-foreground">Password updated.</p>{/if}
        <Button type="submit" size="sm" disabled={savingPassword || !currentPassword || !newPassword} class="self-start">
          {savingPassword ? "Saving…" : "Update password"}
        </Button>
      </form>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-destructive">Danger zone</Card.Title>
    </Card.Header>
    <Card.Content class="pt-0 pb-3">
      {#if !confirmingDelete}
        <Button variant="outline" size="sm" onclick={() => (confirmingDelete = true)}>Delete account</Button>
      {:else}
        <div class="flex flex-col gap-2 max-w-xs">
          <p class="text-sm text-muted-foreground">
            This permanently deletes the account for <span class="font-medium text-foreground">@{user?.username}</span>
            and all its synced data. This can't be undone.
          </p>
          <input
            type="password"
            placeholder="Confirm your password"
            autocomplete="current-password"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={deletePassword}
          />
          {#if deleteError}<p class="text-xs text-destructive">{deleteError}</p>{/if}
          <div class="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting || !deletePassword}
              onclick={() => void deleteAccount()}
            >
              {deleting ? "Deleting…" : "Yes, delete this account"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                confirmingDelete = false;
                deletePassword = "";
                deleteError = null;
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
