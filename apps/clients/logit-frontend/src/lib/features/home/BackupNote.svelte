<script lang="ts">
  // Home, on a phone whose Free account backs up another phone (decision D5, bug hunt 12.1):
  // said once on Home, not only in Settings, with the two ways out.
  import { goto } from "$app/navigation";
  import { CloudOff } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { apiClient } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { syncRunning, lastSyncedAt, markFullUploadDue, syncAll } from "$lib/sync/syncService";

  const KEY = "logit:home:backup-note-hidden";
  let hidden = $state(getAccountItem(KEY) === "1");
  let moving = $state(false);
  let error = $state<string | null>(null);

  const show = $derived.by(() => {
    void $syncRunning;
    void $lastSyncedAt;
    return !hidden && !!authStore.user && authStore.user.tier === "Free" && !apiClient.isSelfHosted() && apiClient.isBackupElsewhere();
  });

  async function moveHere() {
    moving = true;
    error = null;
    try {
      await apiClient.moveBackupHere();
      markFullUploadDue();
      await syncAll().catch(() => {});
    } catch {
      error = "Couldn't move it. Check your connection and try again.";
    } finally {
      moving = false;
    }
  }
</script>

{#if show}
  <Card.Root class="w-full">
    <Card.Content class="flex flex-col gap-3 pt-4">
      <div class="flex items-center gap-2.5">
        <CloudOff class="size-5 shrink-0 text-warning" aria-hidden="true" />
        <h2 class="text-[15px] font-semibold">This phone isn't backed up</h2>
      </div>
      <p class="text-sm text-muted-foreground">Your free backup is on your other phone. Workouts you log here stay on this phone.</p>
      {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
      <div class="flex gap-2">
        <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium disabled:opacity-60" disabled={moving} onclick={() => void moveHere()}>
          {moving ? "Moving…" : "Move backup here"}
        </button>
        <button type="button" class="h-11 flex-1 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground" onclick={() => goto("/plans")}>Both, with Pro</button>
      </div>
      <button type="button" class="h-11 w-fit text-[13px] font-medium text-muted-foreground" onclick={() => { hidden = true; setAccountItem(KEY, "1"); }}>Don't show again</button>
    </Card.Content>
  </Card.Root>
{/if}
