<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiClient, ApiError, type BillingStatus } from "@logit/core/api/client";
  import * as Card from "$lib/components/ui/card";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";

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

  async function saveDisplayName() {
    if (!displayName.trim()) return;
    savingName = true;
    try {
      await apiClient.updateDisplayName(displayName.trim());
      toast.success("Display name saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your display name.");
    } finally {
      savingName = false;
    }
  }

  // --- Change password ---
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let passwordError = $state<string | null>(null);
  let savingPassword = $state(false);

  async function changePassword(e: Event) {
    e.preventDefault();
    passwordError = null;
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
      toast.success("Password updated");
    } catch (e) {
      passwordError = e instanceof ApiError ? e.message : "Failed to update password.";
    } finally {
      savingPassword = false;
    }
  }

  // --- Delete account ---
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deletePassword = $state("");
  let deleteError = $state<string | null>(null);

  $effect(() => {
    if (!deleteOpen) {
      deletePassword = "";
      deleteError = null;
    }
  });

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
        <Label for="display-name">Display name</Label>
        <Input id="display-name" type="text" bind:value={displayName} />
      </div>
      <Button size="sm" class="self-start" disabled={savingName || !displayName.trim()} onclick={() => void saveDisplayName()}>
        {savingName ? "Saving…" : "Save"}
      </Button>
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
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-8 w-40" />
      {:else}
        <p class="text-sm">{user?.tier ?? "Free"} plan</p>
        {#if user?.tier === "Free"}
          <Button href={PRICING_URL} size="sm" class="self-start">Upgrade to Pro or Studio</Button>
        {:else}
          <Button size="sm" class="self-start" disabled={portalLoading} onclick={() => void openBillingPortal()}>
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
        <Input type="password" placeholder="Current password" autocomplete="current-password" bind:value={currentPassword} />
        <Input type="password" placeholder="New password" autocomplete="new-password" bind:value={newPassword} />
        <Input type="password" placeholder="Confirm new password" autocomplete="new-password" bind:value={confirmPassword} />
        {#if passwordError}<p class="text-xs text-destructive">{passwordError}</p>{/if}
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
      <AlertDialog.Root bind:open={deleteOpen}>
        <AlertDialog.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm">Delete account</Button>
          {/snippet}
        </AlertDialog.Trigger>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete your account?</AlertDialog.Title>
            <AlertDialog.Description>
              This permanently deletes the account for @{user?.username} and all its synced data.
              This can't be undone.
            </AlertDialog.Description>
          </AlertDialog.Header>
          <Input
            type="password"
            placeholder="Confirm your password"
            autocomplete="current-password"
            bind:value={deletePassword}
          />
          {#if deleteError}
            <Alert.Root variant="destructive">
              <Alert.Description>{deleteError}</Alert.Description>
            </Alert.Root>
          {/if}
          <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <Button
              variant="destructive"
              disabled={deleting || !deletePassword}
              onclick={() => void deleteAccount()}
            >
              {deleting ? "Deleting…" : "Yes, delete this account"}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Card.Content>
  </Card.Root>
</div>
