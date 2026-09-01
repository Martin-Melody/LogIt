<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Search } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { fetchRegistry, type RegistryEntry } from "$lib/plugins/registry";
  import {
    installPluginFromManifest,
    listInstalledPluginManifests,
    pluginSettings,
    isExecutablePluginFamily,
  } from "$lib/plugins";
  import type { PluginFamily } from "$lib/plugins";
  import { ShieldAlert } from "lucide-svelte";
  import { resolvePluginManifest } from "$lib/plugins/discovery";
  import { homeConfig } from "$lib/stores/homeConfig.store";
  import type { InstalledPlugin } from "$lib/plugins";

  const ui = $state({
    loading: true,
    error: null as string | null,
  });

  let entries = $state<RegistryEntry[]>([]);
  let installed = $state<InstalledPlugin[]>([]);
  let query = $state("");
  let familyFilter = $state("all");
  let installingIds = $state<Record<string, boolean>>({});
  let installErrors = $state<Record<string, string>>({});

  const installedIds = $derived(new Set(installed.map((p) => p.manifest.id)));

  const filtered = $derived(
    entries
      .filter((e) => familyFilter === "all" || e.family === familyFilter)
      .filter((e) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      }),
  );

  const featured = $derived(filtered.filter((e) => e.featured));
  const rest = $derived(filtered.filter((e) => !e.featured));

  function familyLabel(family: string): string {
    switch (family) {
      case "widget": return "Home widget";
      case "progression-algorithm": return "Progression algorithm";
      case "exercise-pack": return "Exercise pack";
      case "analytics": return "Analytics module";
      case "nutrition-algorithm": return "Nutrition algorithm";
      case "nutrition-analytics": return "Nutrition insights";
      default: return family;
    }
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const [registry, installedList] = await Promise.all([
        fetchRegistry(),
        listInstalledPluginManifests(),
      ]);
      entries = registry;
      installed = installedList;
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to load registry";
    } finally {
      ui.loading = false;
    }
  }

  function blockedByRestrictedMode(family: PluginFamily): boolean {
    return isExecutablePluginFamily(family) && !$pluginSettings.communityPluginsEnabled;
  }

  async function install(entry: RegistryEntry) {
    if (installingIds[entry.id]) return;
    if (blockedByRestrictedMode(entry.family)) {
      installErrors = {
        ...installErrors,
        [entry.id]: "Turn on community plugins to install this.",
      };
      return;
    }
    installingIds = { ...installingIds, [entry.id]: true };
    installErrors = { ...installErrors, [entry.id]: "" };
    try {
      const manifest = await resolvePluginManifest({ kind: "url", url: entry.manifestUrl });
      await installPluginFromManifest(manifest, true);
      await homeConfig.reconcilePlugins();
      installed = await listInstalledPluginManifests();
    } catch (error) {
      installErrors = {
        ...installErrors,
        [entry.id]: error instanceof Error ? error.message : "Install failed",
      };
    } finally {
      installingIds = { ...installingIds, [entry.id]: false };
    }
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:head>
  <title>Browse plugins</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => void goto("/plugins")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <span class="text-sm font-semibold">Browse plugins</span>
  </div>

  <div class="flex flex-col gap-3 p-3">
    <!-- Search + filter -->
    <div class="flex flex-col gap-2">
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search plugins…"
          class="w-full rounded border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={query}
        />
      </div>

      <div class="flex overflow-hidden rounded border text-xs">
        <button
          type="button"
          class="flex-1 px-3 py-1.5 {familyFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}"
          onclick={() => (familyFilter = "all")}
        >
          All
        </button>
        <button
          type="button"
          class="flex-1 border-l px-3 py-1.5 {familyFilter === 'widget' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}"
          onclick={() => (familyFilter = "widget")}
        >
          Widgets
        </button>
        <button
          type="button"
          class="flex-1 border-l px-3 py-1.5 {familyFilter === 'progression-algorithm' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}"
          onclick={() => (familyFilter = "progression-algorithm")}
        >
          Progression
        </button>
        <button
          type="button"
          class="flex-1 border-l px-3 py-1.5 {familyFilter === 'analytics' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}"
          onclick={() => (familyFilter = "analytics")}
        >
          Analytics
        </button>
        <button
          type="button"
          class="flex-1 border-l px-3 py-1.5 {familyFilter === 'exercise-pack' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}"
          onclick={() => (familyFilter = "exercise-pack")}
        >
          Packs
        </button>
      </div>
    </div>

    {#if ui.error}
      <p class="text-sm text-destructive">{ui.error}</p>
    {/if}

    {#if !$pluginSettings.communityPluginsEnabled}
      <div class="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Community plugins are off. Widgets, progression and analytics plugins
          can't be installed until you
          <button type="button" class="underline underline-offset-2" onclick={() => void goto("/plugins")}>turn them on</button>.
          Exercise and food packs still install.
        </span>
      </div>
    {/if}

    {#if ui.loading}
      <p class="text-sm text-muted-foreground">Loading registry…</p>
    {:else if filtered.length === 0}
      <Card.Root class="w-full">
        <Card.Content class="py-8 text-center">
          <p class="text-sm font-medium">No plugins found</p>
          <p class="mt-1 text-xs text-muted-foreground">Try a different search or filter.</p>
        </Card.Content>
      </Card.Root>
    {:else}
      {#if featured.length > 0}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>Featured</Card.Title>
          </Card.Header>
          <Card.Content>
            <ul class="flex flex-col gap-2">
              {#each featured as entry (entry.id)}
                {@const isInstalled = installedIds.has(entry.id)}
                {@const isInstalling = installingIds[entry.id]}
                <li class="rounded border p-3 {isInstalled ? 'border-primary/30 bg-primary/5' : 'border-border'}">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{entry.name}</p>
                        {#if isInstalled}
                          <span class="rounded border border-primary px-1.5 py-0.5 text-xs font-medium text-primary">Installed</span>
                        {/if}
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                      <p class="mt-1 text-xs text-muted-foreground/60">
                        {familyLabel(entry.family)}{entry.author ? ` · ${entry.author}` : ""}
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-col gap-1.5 items-end">
                      {#if isInstalled}
                        <Button variant="ghost" size="sm" onclick={() => void goto(`/plugins/${entry.id}`)}>
                          Open
                        </Button>
                      {:else}
                        <Button
                          size="sm"
                          disabled={isInstalling || blockedByRestrictedMode(entry.family)}
                          onclick={() => void install(entry)}
                        >
                          {isInstalling ? "Installing…" : "Install"}
                        </Button>
                      {/if}
                    </div>
                  </div>
                  {#if installErrors[entry.id]}
                    <p class="mt-2 text-xs text-destructive">{installErrors[entry.id]}</p>
                  {/if}
                </li>
              {/each}
            </ul>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if rest.length > 0}
        <Card.Root class="w-full">
          <Card.Header>
            <Card.Title>All plugins</Card.Title>
          </Card.Header>
          <Card.Content>
            <ul class="flex flex-col gap-2">
              {#each rest as entry (entry.id)}
                {@const isInstalled = installedIds.has(entry.id)}
                {@const isInstalling = installingIds[entry.id]}
                <li class="rounded border p-3 {isInstalled ? 'border-primary/30 bg-primary/5' : 'border-border'}">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{entry.name}</p>
                        {#if isInstalled}
                          <span class="rounded border border-primary px-1.5 py-0.5 text-xs font-medium text-primary">Installed</span>
                        {/if}
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                      <p class="mt-1 text-xs text-muted-foreground/60">
                        {familyLabel(entry.family)}{entry.author ? ` · ${entry.author}` : ""}
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-col gap-1.5 items-end">
                      {#if isInstalled}
                        <Button variant="ghost" size="sm" onclick={() => void goto(`/plugins/${entry.id}`)}>
                          Open
                        </Button>
                      {:else}
                        <Button
                          size="sm"
                          disabled={isInstalling || blockedByRestrictedMode(entry.family)}
                          onclick={() => void install(entry)}
                        >
                          {isInstalling ? "Installing…" : "Install"}
                        </Button>
                      {/if}
                    </div>
                  </div>
                  {#if installErrors[entry.id]}
                    <p class="mt-2 text-xs text-destructive">{installErrors[entry.id]}</p>
                  {/if}
                </li>
              {/each}
            </ul>
          </Card.Content>
        </Card.Root>
      {/if}

      <p class="px-1 text-xs text-muted-foreground">
        {filtered.length} plugin{filtered.length === 1 ? "" : "s"} · Have one to share? Paste a manifest URL on the
        <button type="button" class="underline underline-offset-2" onclick={() => void goto("/plugins/import")}>import page</button>.
      </p>
    {/if}
  </div>
</div>
