<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Compass, Plus, Send, ShieldAlert, ShieldCheck } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import {
    listBuiltinPluginManifests,
    listInstalledPluginManifests,
    pluginSettings,
    isExecutablePluginFamily,
  } from "$lib/plugins";
  import type { InstalledPlugin, PluginManifest } from "$lib/plugins";

  let enableDialogOpen = $state(false);

  function turnOnCommunityPlugins() {
    pluginSettings.enableCommunityPlugins();
    enableDialogOpen = false;
  }

  const ui = $state({
    loading: true,
    error: null as string | null,
  });

  let builtins = $state<PluginManifest[]>([]);
  let installed = $state<InstalledPlugin[]>([]);

  function sortByName<T extends { name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  const widgets = $derived(sortByName(builtins.filter((p) => p.family === "widget")));
  const progressionAlgorithms = $derived(
    sortByName(builtins.filter((p) => p.family === "progression-algorithm")),
  );
  const analyticsPlugins = $derived(sortByName(builtins.filter((p) => p.family === "analytics")));
  const installedPlugins = $derived(sortByName(installed.map((p) => p.manifest)));

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

  function originLabel(manifest: PluginManifest): string {
    switch (manifest.distribution.origin) {
      case "builtin": return "Built in";
      case "manual": return "Manual install";
      case "url": return "URL install";
      case "activitypub": return "Fediverse";
    }
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const [builtinList, installedList] = await Promise.all([
        listBuiltinPluginManifests(),
        listInstalledPluginManifests(),
      ]);
      builtins = builtinList;
      installed = installedList;
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to load plugins";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:head>
  <title>Plugins</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => void goto("/profile")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <span class="text-sm font-semibold">Plugins</span>
    <div class="ml-auto flex items-center gap-1">
      <Button variant="ghost" size="icon" class="h-8 w-8" title="Publish queue" onclick={() => void goto("/plugins/publish")}>
        <Send class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" class="h-8 w-8" title="Browse" onclick={() => void goto("/plugins/browse")}>
        <Compass class="h-4 w-4" />
      </Button>
      <Button size="sm" onclick={() => void goto("/plugins/import")}>
        <Plus class="mr-1.5 h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  </div>

  <div class="flex flex-col gap-3 p-3">
    {#if ui.error}
      <p class="text-sm text-destructive">{ui.error}</p>
    {/if}

    {#if !$pluginSettings.communityPluginsEnabled}
      <Card.Root class="w-full border-amber-500/40 bg-amber-500/5">
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-base">
            <ShieldAlert class="h-4 w-4 text-amber-600" />
            Community plugins are off
          </Card.Title>
          <Card.Description>
            Widgets, progression and analytics plugins from the community run code
            inside the app. They stay disabled until you turn them on. Exercise and
            food packs are plain data and always install.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Button size="sm" onclick={() => (enableDialogOpen = true)}>
            <ShieldCheck class="mr-1.5 h-3.5 w-3.5" />
            Turn on community plugins
          </Button>
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
        <div class="flex items-center gap-2 text-sm">
          <ShieldCheck class="h-4 w-4 text-emerald-600" />
          Community plugins enabled
        </div>
        <Button variant="ghost" size="sm" onclick={() => pluginSettings.disableCommunityPlugins()}>
          Turn off
        </Button>
      </div>
    {/if}

    <Card.Root class="w-full">
      <Card.Header>
        <Card.Title>Installed</Card.Title>
        <Card.Description>Community plugins installed on this device.</Card.Description>
      </Card.Header>
      <Card.Content>
        {#if ui.loading}
          <p class="text-sm text-muted-foreground">Loading…</p>
        {:else if installedPlugins.length === 0}
          <div class="flex flex-col items-center gap-3 py-6 text-center">
            <p class="text-sm text-muted-foreground">No plugins installed yet.</p>
            <div class="flex gap-2">
              <Button size="sm" onclick={() => void goto("/plugins/browse")}>
                <Compass class="mr-1.5 h-3.5 w-3.5" />
                Browse registry
              </Button>
              <Button variant="outline" size="sm" onclick={() => void goto("/plugins/import")}>
                Import by URL
              </Button>
            </div>
          </div>
        {:else}
          <ul class="flex flex-col gap-2">
            {#each installed as plugin (plugin.manifest.id)}
              <li class="rounded border p-3 {plugin.enabled ? 'border-border' : 'border-border opacity-60'}">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium truncate">{plugin.manifest.name}</p>
                      {#if plugin.enabled}
                        <span class="rounded border border-primary px-1.5 py-0.5 text-xs font-medium text-primary">On</span>
                      {:else}
                        <span class="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Off</span>
                      {/if}
                    </div>
                    <p class="mt-0.5 text-xs text-muted-foreground">{plugin.manifest.description}</p>
                    <p class="mt-1 text-xs text-muted-foreground/60">
                      {capabilityLabel(plugin.manifest)} · {originLabel(plugin.manifest)} · v{plugin.manifest.version}
                    </p>
                    {#if plugin.enabled && isExecutablePluginFamily(plugin.manifest.family) && !$pluginSettings.communityPluginsEnabled}
                      <p class="mt-1 text-xs text-amber-600">
                        Not running — community plugins are off.
                      </p>
                    {/if}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="shrink-0"
                    onclick={() => void goto(`/plugins/${plugin.manifest.id}`)}
                  >
                    Manage
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Card.Content>
    </Card.Root>

    {#if !ui.loading}
      <Card.Root class="w-full">
        <Card.Header>
          <Card.Title>Built-in</Card.Title>
          <Card.Description>
            Extension points the app ships with. Community plugins use the same format.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-4">
          {#if widgets.length > 0}
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Widgets</p>
              <ul class="flex flex-col gap-1.5">
                {#each widgets as plugin (plugin.id)}
                  <li class="rounded border border-border p-2.5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{plugin.name}</p>
                        <p class="text-xs text-muted-foreground">{plugin.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0"
                        onclick={() => void goto(`/plugins/${plugin.id}`)}
                      >
                        Details
                      </Button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if progressionAlgorithms.length > 0}
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Progression</p>
              <ul class="flex flex-col gap-1.5">
                {#each progressionAlgorithms as plugin (plugin.id)}
                  <li class="rounded border border-border p-2.5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{plugin.name}</p>
                        <p class="text-xs text-muted-foreground">{plugin.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0"
                        onclick={() => void goto(`/plugins/${plugin.id}`)}
                      >
                        Details
                      </Button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if analyticsPlugins.length > 0}
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Analytics</p>
              <ul class="flex flex-col gap-1.5">
                {#each analyticsPlugins as plugin (plugin.id)}
                  <li class="rounded border border-border p-2.5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{plugin.name}</p>
                        <p class="text-xs text-muted-foreground">{plugin.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0"
                        onclick={() => void goto(`/plugins/${plugin.id}`)}
                      >
                        Details
                      </Button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</div>

<Dialog.Root bind:open={enableDialogOpen}>
  <Dialog.Content class="sm:max-w-[440px]">
    <Dialog.Header>
      <Dialog.Title>Turn on community plugins?</Dialog.Title>
      <Dialog.Description>
        Community widgets, progression algorithms and analytics modules run their
        own code inside Logit. Only enable this if you trust the plugins you
        install. You can turn it back off at any time, and each plugin still has
        its own on/off switch.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (enableDialogOpen = false)}>Cancel</Button>
      <Button onclick={turnOnCommunityPlugins}>Turn on</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
