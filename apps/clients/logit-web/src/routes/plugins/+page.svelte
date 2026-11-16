<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { pluginsApi, type HostedRegistryEntry, type MyPlugin, type ServedManifest } from "@logit/core/api/pluginsApi";
  import { FAMILY_LABELS, familyLabel, getsSummary } from "@logit/core/plugins/pluginInfo";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import CommunitySwitch from "$lib/features/plugins/CommunitySwitch.svelte";
  import InstallDialog from "$lib/features/plugins/InstallDialog.svelte";
  import { latestStatus, STATUS_LABEL, versionAfter } from "$lib/features/plugins/myPlugins";

  // Me › Plugins: browse LogIt's reviewed plugins, the ones installed on your account (the
  // same list as the phone's), and the ones you're building.

  type Tab = "browse" | "installed" | "mine";
  const tab = $derived<Tab>((["installed", "mine"] as const).find((t) => t === page.url.searchParams.get("tab")) ?? "browse");

  let query = $state("");
  let family = $state<string>("all");
  let mine = $state<MyPlugin[] | null>(null);
  let loadError = $state<string | null>(null);
  let installing = $state<ServedManifest | null>(null);
  let busyId = $state<string | null>(null);

  const FILTERS: [string, string][] = [
    ["all", "All"],
    ["widget", "Widgets"],
    ["progression-algorithm", "Progression"],
    ["mobility-progression", "Mobility progression"],
    ["analytics", "Analytics"],
    ["nutrition", "Nutrition"],
    ["exercise-pack", "Exercise packs"],
    ["mobility-pack", "Mobility packs"],
  ];

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return (plugins.catalog ?? []).filter((e) => {
      if (family === "nutrition" ? !e.family.startsWith("nutrition") : family !== "all" && e.family !== family) return false;
      return !q || `${e.name} ${e.description} ${e.author ?? ""}`.toLowerCase().includes(q);
    });
  });

  const catalogById = $derived(new Map((plugins.catalog ?? []).map((e) => [e.id, e])));

  async function load() {
    try {
      await Promise.all([
        plugins.loadCatalog(),
        plugins.loadInstalls(),
        pluginsApi.mine().then((r) => (mine = r.plugins)),
      ]);
      loadError = null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't load your plugins";
    }
  }
  onMount(load);

  function setTab(t: Tab) {
    const url = new URL(page.url);
    if (t === "browse") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    void goto(url, { noScroll: true, keepFocus: true });
    if (t === "mine") guideSignal("plugins.mine-opened");
  }

  async function openInstall(entry: HostedRegistryEntry) {
    busyId = entry.id;
    try {
      installing = (await pluginsApi.listed(entry.id)).manifest;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load that plugin");
    } finally {
      busyId = null;
    }
  }

  async function toggle(id: string, on: boolean) {
    try {
      await plugins.setEnabled(id, on);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }

  async function remove(id: string, name: string) {
    try {
      await plugins.remove(id);
      toast.success(`Removed ${name}. It goes from your phone at its next sync.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove it");
    }
  }

  const tabClass = (on: boolean) =>
    `inline-flex h-[34px] items-center border-b-2 px-1 text-sm ${on ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border px-3 text-xs font-medium whitespace-nowrap";
  const btnPri = "inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-primary px-3 text-xs font-semibold whitespace-nowrap text-primary-foreground disabled:opacity-50";
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Plugins</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">
        Install here or on your phone and it's on both. Plugins run in a sandbox and only get the data they ask for.
      </p>
    </div>
    <a href="/plugins/builder/new" class="inline-flex h-[34px] items-center rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Build a plugin</a>
  </header>

  <div role="tablist" aria-label="Plugins" data-guide="plugins-tabs" class="flex gap-[22px] border-b border-border">
    <button type="button" role="tab" aria-selected={tab === "browse"} class={tabClass(tab === "browse")} onclick={() => setTab("browse")}>Browse</button>
    <button type="button" role="tab" aria-selected={tab === "installed"} class={tabClass(tab === "installed")} onclick={() => setTab("installed")}>Installed{plugins.installsLoaded ? ` · ${plugins.installed.length}` : ""}</button>
    <button type="button" role="tab" aria-selected={tab === "mine"} class={tabClass(tab === "mine")} onclick={() => setTab("mine")}>My plugins{mine ? ` · ${mine.length}` : ""}</button>
  </div>

  {#if loadError}
    <Alert.Root variant="destructive"><Alert.Description>{loadError}</Alert.Description></Alert.Root>
  {/if}

  <CommunitySwitch />

  {#if tab === "browse"}
    <div class="flex flex-wrap items-center gap-2">
      <label for="plugin-q" class="sr-only">Search plugins</label>
      <input id="plugin-q" bind:value={query} placeholder="Search plugins" class="h-[34px] w-[220px] rounded-[10px] border border-border bg-card px-3 text-[13px]" />
      {#each FILTERS as [value, label] (value)}
        <button type="button" aria-pressed={family === value} onclick={() => (family = value)}
          class="h-[30px] rounded-full border px-3 text-xs {family === value ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'border-border text-muted-foreground'}">{label}</button>
      {/each}
    </div>

    {#if !plugins.catalog}
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {#each [0, 1, 2] as i (i)}<Skeleton class="h-40" />{/each}
      </div>
    {:else if plugins.catalogError}
      <Alert.Root variant="destructive"><Alert.Description>{plugins.catalogError}</Alert.Description></Alert.Root>
    {:else if shown.length === 0}
      <p class="rounded-[10px] border border-border bg-card px-[18px] py-6 text-[13px] text-muted-foreground">
        {plugins.catalog.length === 0 ? "No plugins have been listed yet. Build the first one?" : "Nothing matches that."}
      </p>
    {:else}
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {#each shown as e (e.id)}
          {@const have = plugins.get(e.id)}
          <article class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div>
              <a href="/plugins/{encodeURIComponent(e.id)}" class="block text-sm font-semibold hover:underline">{e.name}</a>
              <span class="text-xs text-muted-foreground">{familyLabel(e.family)}{e.author ? ` · ${e.author}` : ""} · {e.version}</span>
            </div>
            <p class="m-0 line-clamp-3 text-[13px] leading-normal text-muted-foreground">{e.description}</p>
            <span class="text-xs text-muted-foreground">Gets: {getsSummary(e.family, e.needs ?? undefined)}</span>
            <div class="mt-auto flex items-center justify-between gap-2">
              <span class="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Reviewed</span>
              {#if have && have.manifest.version === e.version}
                <span class="text-xs text-muted-foreground">Installed</span>
              {:else}
                <button type="button" disabled={busyId === e.id} onclick={() => openInstall(e)} class={btnPri}>{have?.source === "draft" ? "Install published" : have ? "Update" : "Install"}</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
    <p class="text-xs text-muted-foreground">Every plugin here was checked by LogIt before it was listed. You see what it gets before you install it.</p>
  {:else if tab === "installed"}
    {#if !plugins.installsLoaded}
      <Skeleton class="h-48" />
    {:else if plugins.installed.length === 0}
      <p class="rounded-[10px] border border-border bg-card px-[18px] py-6 text-[13px] text-muted-foreground">
        Nothing installed yet. <button type="button" class="underline underline-offset-4" onclick={() => setTab("browse")}>Browse plugins</button>
      </p>
    {:else}
      <section class="overflow-x-auto rounded-[10px] border border-border bg-card px-2 py-1.5">
        <table class="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr class="text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <th scope="col" class="px-2.5 py-2">Plugin</th>
              <th scope="col" class="px-2.5 py-2">Type</th>
              <th scope="col" class="px-2.5 py-2">Version</th>
              <th scope="col" class="px-2.5 py-2">Gets</th>
              <th scope="col" class="px-2.5 py-2">On</th>
              <th scope="col" class="px-2.5 py-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#each plugins.installed as p (p.manifest.id)}
              {@const listed = catalogById.get(p.manifest.id)}
              {@const update = p.source === "registry" && listed?.version && versionAfter(listed.version, p.manifest.version)}
              <tr class="border-t border-border/60">
                <td class="px-2.5 py-3">
                  <span class="font-semibold">{p.manifest.name}</span>
                  {#if p.source === "draft"}<span class="ml-1.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-200">Your draft</span>{/if}
                  {#if p.source === "link"}<span class="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">By link</span>{/if}
                  <br /><span class="text-xs text-muted-foreground">{p.manifest.author ?? ""}</span>
                </td>
                <td class="px-2.5 py-3 text-muted-foreground">{familyLabel(p.manifest.family)}</td>
                <td class="px-2.5 py-3">
                  {p.manifest.version}
                  {#if update}<span class="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{listed!.version} ready</span>{/if}
                </td>
                <td class="px-2.5 py-3 text-muted-foreground">{getsSummary(p.manifest.family, p.manifest.needs as string[] | undefined)}</td>
                <td class="px-2.5 py-3">
                  <button type="button" role="switch" aria-checked={p.enabled} aria-label="{p.manifest.name} on" onclick={() => toggle(p.manifest.id, !p.enabled)}
                    class="relative h-[22px] w-[38px] rounded-full {p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}">
                    <span class="absolute top-[3px] h-4 w-4 rounded-full bg-background transition-all {p.enabled ? 'left-[19px]' : 'left-[3px]'}"></span>
                  </button>
                </td>
                <td class="px-2.5 py-3 text-right whitespace-nowrap">
                  {#if update && listed}<button type="button" class={btnPri} onclick={() => openInstall(listed)}>Review update</button>{/if}
                  {#if p.source === "draft"}<a class={btn} href="/plugins/builder/{encodeURIComponent(p.manifest.id)}">Open</a>{/if}
                  <button type="button" class={btn} onclick={() => remove(p.manifest.id, p.manifest.name)}>Remove</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
      <p class="text-xs leading-normal text-muted-foreground">
        What you install, switch off or remove here changes on your phone at its next sync, and the other way round. Updates are
        never automatic: "Review update" shows what it gets before it installs.
      </p>
    {/if}
  {:else}
    <section data-guide="plugins-mine" class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 class="text-sm font-semibold">My plugins</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">Plugins you're building. Only you can see a draft until you publish it.</p>
        </div>
        <a href="/plugins/builder/new" class={btn}>New plugin</a>
      </div>
      {#if !mine}
        <Skeleton class="h-16" />
      {:else if mine.length === 0}
        <p class="text-[13px] text-muted-foreground">None yet. Start from a working example for any plugin type, then change it.</p>
      {:else}
        {#each mine as m (m.pluginId)}
          {@const status = latestStatus(m)}
          {@const trying = plugins.get(m.pluginId)?.source === "draft"}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-muted/60 px-3.5 py-3">
            <span class="flex min-w-0 flex-col gap-1">
              <span class="text-sm font-semibold">
                {m.name}
                {#if status}<span class="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold {status.tone}">{STATUS_LABEL[status.release.status]} {status.release.version}</span>{/if}
              </span>
              <span class="text-xs text-muted-foreground">
                {FAMILY_LABELS[m.family] ?? m.family} · {m.pluginId}{trying ? " · on your phone to try" : ""}
              </span>
              {#if status?.release.status === "rejected" && status.release.reviewNote}
                <span class="text-xs text-amber-700 dark:text-amber-300">To change: {status.release.reviewNote}</span>
              {/if}
            </span>
            <a href="/plugins/builder/{encodeURIComponent(m.pluginId)}" class={btnPri}>Open</a>
          </div>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<InstallDialog bind:manifest={installing} />
