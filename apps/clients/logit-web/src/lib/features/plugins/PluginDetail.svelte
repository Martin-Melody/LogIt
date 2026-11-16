<script lang="ts">
  import type { ServedManifest } from "@logit/core/api/pluginsApi";
  import type { PluginInstallSource } from "@logit/core/plugins/pluginInstalls";
  import { familyLabel, isCodeFamily, pluginCan, pluginGets } from "@logit/core/plugins/pluginInfo";
  import { toast } from "$lib/components/ui/sonner";
  import { plugins, fetchSource } from "./pluginData.svelte";
  import InstallDialog from "./InstallDialog.svelte";
  import PluginPreview from "./PluginPreview.svelte";
  import { versionAfter } from "./myPlugins";

  /** One plugin: what it does, a preview with your data (widgets), what it gets and can do. */
  let {
    manifest,
    reviewed,
    source,
    versions = [],
    changeNote = null,
    backHref = "/plugins",
    backLabel = "Browse",
  }: {
    manifest: ServedManifest;
    reviewed: boolean;
    source: PluginInstallSource;
    versions?: { version: string; changeNote: string | null; reviewedAt: string | null }[];
    changeNote?: string | null;
    backHref?: string;
    backLabel?: string;
  } = $props();

  let installing = $state<ServedManifest | null>(null);
  let code = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  let showCode = $state(false);

  const have = $derived(plugins.get(manifest.id));
  const newer = $derived(!have || versionAfter(manifest.version, have.manifest.version));
  const latestNote = $derived(changeNote ?? versions[0]?.changeNote ?? null);

  $effect(() => {
    const m = manifest;
    fetchSource(m).then((s) => (code = s), (e) => (codeError = e instanceof Error ? e.message : String(e)));
  });

  const card = "flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4";
  const fmt = (iso: string | null) => (iso ? new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<div class="flex flex-col gap-4">
  <a href={backHref} class="text-[13px] text-muted-foreground hover:text-foreground">‹ {backLabel}</a>
  <header class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">{manifest.name}</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">
        {familyLabel(manifest.family)}{manifest.author ? ` · by ${manifest.author}` : ""} · version {manifest.version} ·
        {#if reviewed}<span class="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Reviewed</span>
        {:else}<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Not reviewed</span>{/if}
      </p>
    </div>
    <div class="flex flex-col items-end gap-1.5">
      {#if have && !newer}
        <span class="text-[13px] text-muted-foreground">Installed{have.enabled ? "" : " (switched off)"}</span>
      {:else}
        <button type="button" onclick={() => (installing = manifest)} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">{have ? `Update to ${manifest.version}` : "Install"}</button>
        <span class="text-xs text-muted-foreground">Goes on your phone and here</span>
      {/if}
    </div>
  </header>

  {#if !reviewed}
    <p class="rounded-[10px] bg-amber-500/10 px-4 py-3 text-[13px] leading-normal text-amber-800 dark:text-amber-200">
      This was shared by link, so LogIt hasn't looked at it. It still runs in the sandbox and only gets what's listed, but install it only if you trust {manifest.author ?? "who sent it"}.
    </p>
  {/if}

  <div class="flex flex-wrap items-start gap-3.5">
    <div class="flex min-w-0 flex-[999_1_460px] flex-col gap-3.5">
      <section class={card}>
        <h2 class="text-sm font-semibold">What it does</h2>
        <p class="text-[13px] leading-relaxed text-muted-foreground">{manifest.description || "No description."}</p>
      </section>

      {#if code && isCodeFamily(manifest.family)}
        <section class={card}>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-semibold">{manifest.family === "widget" ? "Preview with your data" : "Preview with sample data"}</h2>
            <span class="text-xs text-muted-foreground">Runs in the sandbox here; nothing is installed</span>
          </div>
          <div class="max-w-[380px]"><PluginPreview family={manifest.family} source={code} data={manifest.family === "widget" ? "mine" : "sample"} /></div>
        </section>
      {:else if codeError}
        <p class="text-[13px] text-destructive">{codeError}</p>
      {/if}

      {#if latestNote}
        <section class={card}>
          <h2 class="text-sm font-semibold">What's new in {manifest.version}</h2>
          <p class="text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{latestNote}</p>
        </section>
      {/if}
    </div>

    <aside class="flex flex-[1_1_300px] flex-col gap-3.5">
      <section class={card}>
        <h2 class="text-sm font-semibold">What it gets</h2>
        {#if isCodeFamily(manifest.family)}
          {#each pluginGets(manifest.family, manifest.needs) as g (g.label)}
            <div class="flex gap-2.5 text-[13px] leading-normal"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true"></span><span><span class="font-semibold">{g.label}</span><br /><span class="text-muted-foreground">{g.detail}</span></span></div>
          {/each}
          <p class="text-xs leading-normal text-muted-foreground">Nothing else. Plugins can't use the internet, store anything or see your account.</p>
        {:else}
          <p class="text-[13px] text-muted-foreground">Nothing: it's a list of {manifest.family === "mobility-pack" ? "drills" : "exercises"} and runs no code.</p>
        {/if}
      </section>
      <section class={card}>
        <h2 class="text-sm font-semibold">What it can do</h2>
        {#each pluginCan(manifest.family) as c (c)}<div class="text-[13px]">{c}</div>{/each}
      </section>
      <section class="{card} gap-0">
        {#if versions[0]?.reviewedAt}
          <div class="flex justify-between gap-2.5 border-b border-border/60 py-1.5 text-[13px]"><span class="text-muted-foreground">Checked by LogIt</span><span>{fmt(versions[0].reviewedAt)}</span></div>
        {/if}
        {#if versions.length > 1}
          <div class="flex justify-between gap-2.5 border-b border-border/60 py-1.5 text-[13px]"><span class="text-muted-foreground">Versions</span><span>{versions.map((v) => v.version).join(", ")}</span></div>
        {/if}
        <div class="flex justify-between gap-2.5 py-1.5 text-[13px]">
          <span class="text-muted-foreground">Code</span>
          <button type="button" class="underline underline-offset-4" disabled={!code} onclick={() => (showCode = !showCode)}>{showCode ? "Hide" : "View code"}</button>
        </div>
      </section>
    </aside>
  </div>

  {#if showCode && code}
    <pre class="max-h-[60vh] overflow-auto rounded-[10px] border border-border bg-card px-4 py-3 font-mono text-xs leading-relaxed">{code}</pre>
  {/if}
</div>

<InstallDialog bind:manifest={installing} {source} {reviewed} onInstalled={() => toast.message("Find it under Installed.")} />
