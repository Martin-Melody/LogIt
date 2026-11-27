<script lang="ts">
  import { back } from "$lib/navigation";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { goto } from "$app/navigation";
  import { ToggleLeft, Trash2 } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    getInstalledPlugin,
    getPluginManifest,
    setPluginEnabled,
    uninstallPlugin,
    pluginSettings,
    isExecutablePluginFamily,
    getStoredPack,
  } from "$lib/plugins";
  import { type InstalledPlugin, type PluginManifest } from "$lib/plugins";
  import type { ExercisePack } from "@logit/core/plugins/exercisePack";
  import { isCodeFamily, pluginCan, pluginGets } from "@logit/core/plugins/pluginInfo";
  // Installs, switches and removals reach your other devices.
  import "$lib/plugins/pluginSync";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const props = $props<{ params: { id: string } }>();
  const id = $derived(props.params.id);

  const ui = $state({
    loading: true,
    saving: false,
    removing: false,
    error: null as string | null,
    success: null as string | null,
  });

  let manifest = $state<PluginManifest | null>(null);
  let installed = $state<InstalledPlugin | null>(null);
  let pack = $state<ExercisePack | null>(null);

  const isEnabled = $derived(installed?.enabled ?? false);
  const isBuiltin = $derived(manifest?.distribution.origin === "builtin");

  const originLabel = $derived(
    installed?.source === "draft" ? "Your draft, from the web builder"
    : installed?.source === "link" ? "Shared by link"
    : manifest?.distribution.origin === "builtin" ? "Built in"
    : manifest?.distribution.origin === "manual" ? "Manual install"
    : manifest?.distribution.origin === "url" ? "URL install"
    : manifest?.distribution.origin === "activitypub" ? "Fediverse"
    : manifest?.distribution.origin === "inline" ? "File import"
    : null
  );

  function capabilityLabel(manifest: PluginManifest): string {
    const cap = manifest.capabilities[0];
    if (!cap) return "Plugin";
    switch (cap.family) {
      case "widget": return "Home widget";
      case "progression-algorithm": return "Progression algorithm";
      case "mobility-progression": return "Mobility progression";
      case "exercise-pack": return "Exercise pack";
      case "mobility-pack": return "Mobility pack";
      case "analytics": return "Analytics module";
      case "nutrition-algorithm": return "Nutrition algorithm";
      case "nutrition-analytics": return "Nutrition insights";
      case "muscle-group-insight": return "Muscle-group insight";
      case "workout-block": return "Workout block";
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
      pack =
        pluginManifest?.family === "exercise-pack" ? getStoredPack(pluginManifest.id) : null;
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

  $effect(() => {
    id;
    void load();
  });
</script>

<svelte:head>
  <title>Plugin</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/plugins")} />
    <h1 class="page-title">{manifest?.name ?? "Plugin"}</h1>
  </PageHeader>

  <div class="flex flex-col gap-3 p-3">
    {#if ui.error}
      <p class="text-sm text-destructive">{ui.error}</p>
    {/if}
    {#if ui.success}
      <p class="text-sm text-success">{ui.success}</p>
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

      {#if !isBuiltin}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>What it gets</Card.Title>
          </Card.Header>
          <Card.Content class="flex flex-col gap-2.5">
            {#if isCodeFamily(manifest.family)}
              {#each pluginGets(manifest.family, (manifest as PluginManifest & { needs?: string[] }).needs) as g (g.label)}
                <div class="text-sm"><p class="font-medium">{g.label}</p><p class="text-xs text-muted-foreground">{g.detail}</p></div>
              {/each}
              <p class="text-xs text-muted-foreground">No internet, no storage, nothing else.</p>
            {:else}
              <p class="text-sm text-muted-foreground">Nothing: it's data and runs no code.</p>
            {/if}
            {#each pluginCan(manifest.family) as c (c)}
              <p class="text-xs text-muted-foreground">Can: {c.charAt(0).toLowerCase() + c.slice(1)}</p>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Actions — installed community plugins only -->
      {#if installed && !isBuiltin}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Manage</Card.Title>
          </Card.Header>
          <Card.Content class="flex flex-col gap-2">
            {#if isEnabled && isExecutablePluginFamily(manifest.family) && !$pluginSettings.communityPluginsEnabled}
              <p class="w-full text-xs text-warning">
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
              description="Removes it from this phone, and from your other devices and the dashboard when they next sync."
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

      <!-- Exercise pack contents -->
      {#if pack}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Exercises</Card.Title>
            <Card.Description>
              {pack.exercises.length}
              {pack.exercises.length === 1 ? "exercise" : "exercises"} added to your
              catalog while this pack is enabled.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <ul class="flex flex-col gap-1.5">
              {#each pack.exercises as ex (ex.name)}
                <li class="rounded-md border border-border px-3 py-2.5">
                  <p class="text-sm font-medium">{ex.name}</p>
                  {#if ex.primaryMuscles.length > 0}
                    <p class="mt-0.5 text-xs text-muted-foreground capitalize">
                      {ex.primaryMuscles.join(", ")}
                    </p>
                  {/if}
                </li>
              {/each}
            </ul>
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

    {/if}
  </div>
</div>
