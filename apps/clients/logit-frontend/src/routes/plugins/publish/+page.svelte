<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, CheckCircle2, Copy, Download, Trash2 } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    clearPublishQueue,
    listPublishQueue,
    markPublishQueueItemPublished,
    removePublishQueueItem,
    serializePublishPackage,
    summarizePublishQueueItem,
  } from "$lib/plugins/publishQueue";

  type QueueItem = ReturnType<typeof listPublishQueue>[number];

  const ui = $state({
    loading: true,
    error: null as string | null,
    success: null as string | null,
    actionId: null as string | null,
  });

  let items = $state<QueueItem[]>([]);

  function load() {
    ui.loading = true;
    ui.error = null;
    try {
      items = listPublishQueue().sort((a, b) => b.createdAtMs - a.createdAtMs);
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to load queue";
      items = [];
    } finally {
      ui.loading = false;
    }
  }

  async function copyAnnouncement(item: QueueItem) {
    if (!navigator.clipboard) return;
    ui.actionId = item.id;
    ui.error = null;
    ui.success = null;
    try {
      await navigator.clipboard.writeText(JSON.stringify(item.package.announcement, null, 2));
      ui.success = `Copied announcement for ${item.package.manifest.name}.`;
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to copy";
    } finally {
      ui.actionId = null;
    }
  }

  function downloadPackage(item: QueueItem) {
    ui.actionId = item.id;
    ui.error = null;
    ui.success = null;
    try {
      const blob = new Blob([serializePublishPackage(item)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `publish-${item.package.manifest.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      ui.success = `Downloaded package for ${item.package.manifest.name}.`;
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to download";
    } finally {
      ui.actionId = null;
    }
  }

  function publishItem(item: QueueItem) {
    ui.actionId = item.id;
    ui.error = null;
    ui.success = null;
    try {
      markPublishQueueItemPublished(item.id);
      ui.success = `${item.package.manifest.name} marked as published.`;
      load();
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to update item";
    } finally {
      ui.actionId = null;
    }
  }

  function removeItem(item: QueueItem) {
    ui.actionId = item.id;
    ui.error = null;
    ui.success = null;
    try {
      removePublishQueueItem(item.id);
      load();
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to remove item";
    } finally {
      ui.actionId = null;
    }
  }

  function clearAll() {
    ui.error = null;
    ui.success = null;
    try {
      clearPublishQueue();
      items = [];
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to clear queue";
    }
  }

  onMount(() => {
    load();
  });
</script>

<svelte:head>
  <title>Publish queue</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => void goto("/plugins")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <span class="text-sm font-semibold">Publish queue</span>
    {#if items.length > 0}
      <Button variant="ghost" size="sm" class="ml-auto text-xs text-muted-foreground" onclick={clearAll}>
        Clear all
      </Button>
    {/if}
  </div>

  <div class="flex flex-col gap-3 p-3">
    {#if ui.error}
      <p class="text-sm text-destructive">{ui.error}</p>
    {/if}
    {#if ui.success}
      <p class="text-sm text-emerald-600">{ui.success}</p>
    {/if}

    {#if ui.loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if items.length === 0}
      <Card.Root class="w-full">
        <Card.Content class="py-8 text-center">
          <p class="text-sm font-medium">No items queued</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Open a plugin's detail page and use "Add to publish queue" to prepare a fediverse announcement.
          </p>
        </Card.Content>
      </Card.Root>
    {:else}
      {#each items as item (item.id)}
        <Card.Root class="w-full">
          <Card.Header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <Card.Title>{summarizePublishQueueItem(item)}</Card.Title>
                <Card.Description class="break-all">{item.package.actorUrl}</Card.Description>
              </div>
              <span
                class="shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium {item.status === 'published' ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'}"
              >
                {item.status}
              </span>
            </div>
          </Card.Header>
          <Card.Content class="flex flex-col gap-3">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <dt>Queued</dt>
              <dd>{new Date(item.createdAtMs).toLocaleString()}</dd>
              {#if item.updatedAtMs !== item.createdAtMs}
                <dt>Updated</dt>
                <dd>{new Date(item.updatedAtMs).toLocaleString()}</dd>
              {/if}
            </dl>

            <div>
              <p class="mb-1.5 text-xs text-muted-foreground">Announcement JSON</p>
              <pre class="overflow-auto rounded border border-border bg-muted/30 p-3 text-xs leading-relaxed">{JSON.stringify(item.package.announcement, null, 2)}</pre>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={ui.actionId === item.id}
                onclick={() => void copyAnnouncement(item)}
              >
                <Copy class="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={ui.actionId === item.id}
                onclick={() => downloadPackage(item)}
              >
                <Download class="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={ui.actionId === item.id || item.status === "published"}
                onclick={() => publishItem(item)}
              >
                <CheckCircle2 class="mr-1.5 h-3.5 w-3.5" />
                Mark published
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="text-destructive hover:text-destructive"
                disabled={ui.actionId === item.id}
                onclick={() => removeItem(item)}
              >
                <Trash2 class="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    {/if}
  </div>
</div>
