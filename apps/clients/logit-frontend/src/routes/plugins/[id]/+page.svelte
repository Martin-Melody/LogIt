<script lang="ts">
  import { goto } from "$app/navigation";
  import { ArrowLeft, Send, ToggleLeft, Trash2 } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    getInstalledPlugin,
    getPluginManifest,
    setPluginEnabled,
    uninstallPlugin,
    pluginSettings,
    isExecutablePluginFamily,
  } from "$lib/plugins";
  import { type InstalledPlugin, type PluginManifest } from "$lib/plugins";
  import { enqueuePublish } from "$lib/plugins/publishQueue";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  const ui = $state({
    loading: true,
    saving: false,
    removing: false,
    queuing: false,
    error: null as string | null,
    success: null as string | null,
  });

  let manifest = $state<PluginManifest | null>(null);
  let installed = $state<InstalledPlugin | null>(null);
  let actorUrl = $state("");

  const isEnabled = $derived(installed?.enabled ?? false);
  const isBuiltin = $derived(manifest?.distribution.origin === "builtin");

  const actorSourceUrl = $derived(
    manifest
      ? manifest.fediverse?.actorUrl ??
        (manifest.distribution.origin === "activitypub" ? manifest.distribution.actorUrl : null)
      : null,
  );
  const isShareable = $derived(actorSourceUrl !== null);

  const originLabel = $derived(
    manifest?.distribution.origin === "builtin" ? "Built in"
    : manifest?.distribution.origin === "manual" ? "Manual install"
    : manifest?.distribution.origin === "url" ? "URL install"
    : manifest?.distribution.origin === "activitypub" ? "Fediverse"
    : null
  );

  function capabilityLabel(manifest: PluginManifest): string {
    const cap = manifest.capabilities[0];
    if (!cap) return "Plugin";
    switch (cap.family) {
      case "widget": return "Home widget";
      case "progression-algorithm": return "Progression algorithm";
      case "exercise-pack": return "Exercise pack";
      case "analytics": return "Analytics module";
      case "nutrition-algorithm": return "Nutrition algorithm";
      case "nutrition-analytics": return "Nutrition insights";
    }
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const [pluginManifest, installedPlugin] = await Promise.all([
        getPluginManifest(id),
        getInstalledPlugin(id),
      ]);
      manifest = pluginManifest;
      installed = installedPlugin;
      actorUrl =
        pluginManifest?.fediverse?.actorUrl ??
        (pluginManifest?.distribution.origin === "activitypub"
          ? pluginManifest.distribution.actorUrl
          : "") ?? "";
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to load plugin";
      manifest = null;
      installed = null;
    } finally {
      ui.loading = false;
    }
  }

  async function toggleEnabled() {
    if (!installed || ui.saving) return;
    ui.saving = true;
    ui.error = null;
    try {
      await setPluginEnabled(installed.manifest.id, !installed.enabled);
      await load();
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to update plugin";
    } finally {
      ui.saving = false;
    }
  }

  async function removePlugin() {
    if (!installed || ui.removing) return;
    ui.removing = true;
    ui.error = null;
    try {
      await uninstallPlugin(installed.manifest.id);
      await goto("/plugins");
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to remove plugin";
    } finally {
      ui.removing = false;
    }
  }

  async function queuePublishPackage() {
    if (!manifest || !actorUrl.trim() || ui.queuing) return;
    ui.queuing = true;
    ui.error = null;
    ui.success = null;
    try {
      enqueuePublish({ actorUrl: actorUrl.trim(), manifest });
      ui.success = "Added to publish queue.";
      await goto("/plugins/publish");
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to queue publish package";
    } finally {
      ui.queuing = false;
    }
  }

  $effect(() => {
    id;
    void load();
  });
</script>

<svelte:head>
  <title>Plugin</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => void goto("/plugins")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <span class="text-sm font-semibold truncate">{manifest?.name ?? "Plugin"}</span>
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
    {:else if !manifest}
      <p class="text-sm text-muted-foreground">Plugin not found.</p>
    {:else}
      <!-- Info -->
      <Card.Root class="w-full">
        <Card.Header>
          <Card.Title>{manifest.name}</Card.Title>
          <Card.Description>{manifest.description}</Card.Description>
        </Card.Header>
        <Card.Content>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted-foreground">Type</dt>
            <dd>{capabilityLabel(manifest)}</dd>
            <dt class="text-muted-foreground">Version</dt>
            <dd>{manifest.version}</dd>
            {#if manifest.author}
              <dt class="text-muted-foreground">Author</dt>
              <dd>{manifest.author}</dd>
            {/if}
            <dt class="text-muted-foreground">Source</dt>
            <dd>{originLabel}</dd>
            <dt class="text-muted-foreground">Status</dt>
            <dd>
              {#if isBuiltin}
                Built in
              {:else if installed}
                {isEnabled ? "Enabled" : "Disabled"}
              {:else}
                Not installed
              {/if}
            </dd>
          </dl>
        </Card.Content>
      </Card.Root>

      <!-- Actions — installed community plugins only -->
      {#if installed && !isBuiltin}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Manage</Card.Title>
          </Card.Header>
          <Card.Content class="flex flex-col gap-2">
            {#if isEnabled && isExecutablePluginFamily(manifest.family) && !$pluginSettings.communityPluginsEnabled}
              <p class="w-full text-xs text-amber-600">
                This plugin is enabled but not running — community plugins are
                turned off.
                <button type="button" class="underline underline-offset-2" onclick={() => void goto("/plugins")}>Manage</button>
              </p>
            {/if}
            <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ui.saving}
              onclick={() => void toggleEnabled()}
            >
              <ToggleLeft class="mr-1.5 h-3.5 w-3.5" />
              {isEnabled ? "Disable" : "Enable"}
            </Button>
            <ConfirmDialog
              title="Remove this plugin?"
              description="Removes the locally installed plugin. The original source is not affected."
              confirmLabel="Remove"
              cancelLabel="Cancel"
              saving={ui.removing}
              onConfirm={removePlugin}
            >
              {#snippet child({ props })}
                <Button {...props} variant="outline" size="sm" class="text-destructive hover:text-destructive">
                  <Trash2 class="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              {/snippet}
            </ConfirmDialog>
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Source details -->
      {#if manifest.sourceUrl || manifest.fediverse?.actorUrl || manifest.homepageUrl}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Source</Card.Title>
          </Card.Header>
          <Card.Content>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {#if manifest.sourceUrl}
                <dt class="text-muted-foreground">URL</dt>
                <dd class="break-all">{manifest.sourceUrl}</dd>
              {/if}
              {#if manifest.fediverse?.actorUrl}
                <dt class="text-muted-foreground">Actor</dt>
                <dd class="break-all">{manifest.fediverse.actorUrl}</dd>
              {/if}
              {#if manifest.homepageUrl}
                <dt class="text-muted-foreground">Homepage</dt>
                <dd class="break-all">{manifest.homepageUrl}</dd>
              {/if}
            </dl>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Publish — installed plugins only, for plugin authors -->
      {#if installed && !isBuiltin}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Share to fediverse</Card.Title>
            <Card.Description>
              If you built this plugin, enter your actor URL to announce it to the fediverse through the publish queue.
            </Card.Description>
          </Card.Header>
          <Card.Content class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-muted-foreground" for="actor-url">Your actor URL</label>
              <input
                id="actor-url"
                type="url"
                class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={actorUrl}
                placeholder="https://mastodon.social/@you"
              />
            </div>
            {#if !isShareable}
              <p class="text-xs text-muted-foreground">
                This plugin doesn't have actor metadata yet — enter your URL above to prepare a publish package.
              </p>
            {/if}
            <Button
              variant="outline"
              size="sm"
              class="self-start"
              disabled={ui.queuing || !actorUrl.trim()}
              onclick={() => void queuePublishPackage()}
            >
              <Send class="mr-1.5 h-3.5 w-3.5" />
              Add to publish queue
            </Button>
          </Card.Content>
        </Card.Root>
      {/if}
    {/if}
  </div>
</div>
