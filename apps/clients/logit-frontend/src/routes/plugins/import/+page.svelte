<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, CheckCircle2, FileJson, Link2, Globe2, ShieldAlert } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    getPluginManifest,
    installPluginFromManifest,
    listInstalledPluginManifests,
    pluginSettings,
    isExecutablePluginFamily,
  } from "$lib/plugins";
  import type { InstalledPlugin, PluginManifest } from "$lib/plugins";
  import { resolvePluginManifest, type PluginImportSource } from "$lib/plugins/discovery";

  type ImportMode = "url" | "activitypub" | "json";

  const ui = $state({
    loading: false,
    reviewing: false,
    installing: false,
    error: null as string | null,
    success: null as string | null,
  });

  let mode = $state<ImportMode>("url");
  let manifestUrl = $state("");
  let actorUrl = $state("");
  let manifestJson = $state("");
  let reviewed = $state<PluginManifest | null>(null);
  let installed = $state<InstalledPlugin[]>([]);

  const reviewedId = $derived(reviewed?.id ?? null);
  const alreadyInstalled = $derived(
    reviewedId
      ? installed.find((plugin) => plugin.manifest.id === reviewedId) ?? null
      : null,
  );
  const restrictedModeBlocks = $derived(
    !!reviewed &&
      isExecutablePluginFamily(reviewed.family) &&
      !$pluginSettings.communityPluginsEnabled,
  );

  function source(): PluginImportSource {
    if (mode === "url") return { kind: "url", url: manifestUrl.trim() };
    if (mode === "activitypub") return { kind: "activitypub", actorUrl: actorUrl.trim() };
    return { kind: "json", json: manifestJson };
  }

  async function loadInstalled() {
    installed = await listInstalledPluginManifests();
  }

  async function review() {
    ui.reviewing = true;
    ui.error = null;
    ui.success = null;
    reviewed = null;
    try {
      reviewed = await resolvePluginManifest(source());
      if (!reviewed.sourceUrl && mode === "url") {
        reviewed = { ...reviewed, sourceUrl: manifestUrl.trim() };
      }
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to fetch manifest";
    } finally {
      ui.reviewing = false;
    }
  }

  async function install() {
    if (!reviewed) return;
    if (alreadyInstalled) {
      ui.success = "This plugin is already installed.";
      return;
    }
    if (restrictedModeBlocks) {
      ui.error = "Turn on community plugins before installing this.";
      return;
    }
    ui.installing = true;
    ui.error = null;
    ui.success = null;
    try {
      await installPluginFromManifest(reviewed, true);
      ui.success = `${reviewed.name} installed.`;
      await loadInstalled();
      await goto(`/plugins/${reviewed.id}`);
    } catch (error) {
      ui.error = error instanceof Error ? error.message : "Failed to install plugin";
    } finally {
      ui.installing = false;
    }
  }

  function resetReview() {
    reviewed = null;
    ui.error = null;
    ui.success = null;
  }

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

  onMount(() => {
    void loadInstalled();
  });
</script>

<svelte:head>
  <title>Add plugin</title>
</svelte:head>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => void goto("/plugins")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <span class="text-sm font-semibold">Add plugin</span>
  </div>

  <div class="flex flex-col gap-3 p-3">
    {#if ui.error}
      <p class="text-sm text-destructive">{ui.error}</p>
    {/if}
    {#if ui.success}
      <p class="text-sm text-emerald-600">{ui.success}</p>
    {/if}

    <Card.Root class="w-full">
      <Card.Header>
        <Card.Title>Source</Card.Title>
        <Card.Description>
          Paste a URL, a fediverse actor URL, or raw JSON. The app fetches and shows you the plugin details before installing anything.
        </Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-4">
        <div class="flex gap-2">
          <Button
            variant={mode === "url" ? "default" : "outline"}
            size="sm"
            class="gap-1.5"
            onclick={() => { mode = "url"; resetReview(); }}
          >
            <Link2 class="h-3.5 w-3.5" />
            URL
          </Button>
          <Button
            variant={mode === "activitypub" ? "default" : "outline"}
            size="sm"
            class="gap-1.5"
            onclick={() => { mode = "activitypub"; resetReview(); }}
          >
            <Globe2 class="h-3.5 w-3.5" />
            Fediverse actor
          </Button>
          <Button
            variant={mode === "json" ? "default" : "outline"}
            size="sm"
            class="gap-1.5"
            onclick={() => { mode = "json"; resetReview(); }}
          >
            <FileJson class="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>

        {#if mode === "url"}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="manifest-url">Manifest URL</label>
            <input
              id="manifest-url"
              type="url"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="https://example.com/plugin.json"
              bind:value={manifestUrl}
            />
          </div>
        {:else if mode === "activitypub"}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="actor-url">Actor URL</label>
            <input
              id="actor-url"
              type="url"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="https://mastodon.social/@someone"
              bind:value={actorUrl}
            />
            <p class="text-xs text-muted-foreground">
              The app will look through the account's posts for a plugin manifest.
            </p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground" for="manifest-json">Paste manifest JSON</label>
            <textarea
              id="manifest-json"
              rows="10"
              class="w-full rounded border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={`{"id":"...","family":"widget","name":"...","description":"...","version":"1.0.0","distribution":{"origin":"manual"},"capabilities":[...]}`}
              bind:value={manifestJson}
            ></textarea>
          </div>
        {/if}

        <div class="flex flex-wrap gap-2">
          <Button
            disabled={
              ui.reviewing
              || (mode === "url" ? !manifestUrl.trim() : mode === "activitypub" ? !actorUrl.trim() : !manifestJson.trim())
            }
            onclick={() => void review()}
          >
            {ui.reviewing ? "Loading…" : "Review"}
          </Button>
        </div>
      </Card.Content>
    </Card.Root>

    {#if reviewed}
      <Card.Root class="w-full">
        <Card.Header>
          <Card.Title>{reviewed.name}</Card.Title>
          <Card.Description>{reviewed.description}</Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-4">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted-foreground">Type</dt>
            <dd>{capabilityLabel(reviewed)}</dd>
            <dt class="text-muted-foreground">Version</dt>
            <dd>{reviewed.version}</dd>
            {#if reviewed.author}
              <dt class="text-muted-foreground">Author</dt>
              <dd>{reviewed.author}</dd>
            {/if}
            {#if reviewed.sourceUrl}
              <dt class="text-muted-foreground">Source</dt>
              <dd class="break-all">{reviewed.sourceUrl}</dd>
            {/if}
          </dl>

          {#if alreadyInstalled}
            <p class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Already installed.
            </p>
          {/if}

          {#if restrictedModeBlocks}
            <div class="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This is a {capabilityLabel(reviewed).toLowerCase()} — it runs code
                in the app. Turn on community plugins on the
                <button type="button" class="underline underline-offset-2" onclick={() => void goto("/plugins")}>plugins page</button>
                to install it.
              </span>
            </div>
          {/if}

          <div class="flex gap-2">
            <Button
              disabled={ui.installing || !!alreadyInstalled || restrictedModeBlocks}
              onclick={() => void install()}
            >
              <CheckCircle2 class="mr-1.5 h-3.5 w-3.5" />
              {ui.installing ? "Installing…" : "Install"}
            </Button>
            <Button variant="outline" onclick={resetReview}>Clear</Button>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</div>
