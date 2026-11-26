<script lang="ts">
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import OptionSelect from "$lib/components/option-select.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { apiClient } from "@logit/core/api/client";
  import { pluginsApi, type MyPlugin } from "@logit/core/api/pluginsApi";
  import {
    FAMILY_LABELS,
    PLUGIN_FAMILIES,
    WIDGET_NEEDS,
    isCodeFamily,
    readNeedsFromSource,
    writeNeedsToSource,
  } from "@logit/core/plugins/pluginInfo";
  import { idPrefixFor, slugForId, sourceFileName, starterSource } from "@logit/core/plugins/pluginTemplates";
  import { runPluginChecks, type CheckResult } from "@logit/core/plugins/pluginChecks";
  import { runInSandbox } from "@logit/core/plugins/sandbox";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import PluginPreview from "$lib/features/plugins/PluginPreview.svelte";
  import PublishDialog from "$lib/features/plugins/PublishDialog.svelte";
  import { latestStatus, nextVersion, STATUS_LABEL } from "$lib/features/plugins/myPlugins";

  // Me › Plugins › Build: write a plugin at a keyboard, see it run on your own data, try it on
  // your phone, then publish. Building is web-only; the phone browses and installs.

  const pluginId = $derived(page.params.id ?? "new");
  const isNew = $derived(pluginId === "new");
  const author = $derived(`@${apiClient.getUser()?.username ?? "you"}`);

  // ── New plugin ──────────────────────────────────────────────────────────────
  let newName = $state("");
  let newFamily = $state<string>("widget");
  let newId = $state("");
  let idTouched = $state(false);
  let creating = $state(false);
  let createError = $state<string | null>(null);
  $effect(() => {
    if (!idTouched) newId = `${idPrefixFor(apiClient.getUser()?.username ?? "me")}.${slugForId(newName)}`;
  });

  async function create() {
    if (!newName.trim() || creating) return;
    creating = true;
    createError = null;
    try {
      const id = newId.trim();
      const source = starterSource(newFamily, id, newName.trim());
      const needs = newFamily === "widget" ? (readNeedsFromSource(source) ?? []) : undefined;
      await pluginsApi.create(id, newFamily, { name: newName.trim(), description: "", needs, version: "1.0.0" }, source);
      await goto(`/plugins/builder/${encodeURIComponent(id)}`, { replaceState: true });
    } catch (e) {
      createError = e instanceof Error ? e.message : "Couldn't create it";
    } finally {
      creating = false;
    }
  }

  // ── Editing ─────────────────────────────────────────────────────────────────
  let plugin = $state<MyPlugin | null>(null);
  let loadError = $state<string | null>(null);
  let name = $state("");
  let description = $state("");
  let source = $state("");
  let saved = $state({ name: "", description: "", source: "" });
  let saveState = $state<"saved" | "saving" | "unsaved" | "error">("saved");
  let saveError = $state<string | null>(null);
  let view = $state<"code" | "manifest">("code");
  let data = $state<"mine" | "sample" | "empty">("mine");
  let checks = $state<CheckResult | null>(null);
  let checking = $state(false);
  let publishOpen = $state(false);
  let publishInitial = $state<"listed" | "link" | "files">("listed");
  let deleteOpen = $state(false);

  $effect(() => {
    const id = pluginId;
    if (id === "new") return;
    plugin = null;
    loadError = null;
    pluginsApi.get(id).then(
      (p) => {
        plugin = p;
        const m = parseManifest(p.draftManifestJson);
        name = m.name ?? p.name;
        description = m.description ?? "";
        source = p.draftSource ?? "";
        saved = { name, description, source };
        saveState = "saved";
      },
      (e) => (loadError = e instanceof Error ? e.message : "Couldn't load it"),
    );
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
  });

  function parseManifest(json: string | null): { name?: string; description?: string } {
    try {
      return json ? (JSON.parse(json) as { name?: string; description?: string }) : {};
    } catch {
      return {};
    }
  }

  const family = $derived(plugin?.family ?? "widget");
  const needs = $derived(family === "widget" ? readNeedsFromSource(source) : null);
  const dirty = $derived(!!plugin && (name !== saved.name || description !== saved.description || source !== saved.source));
  const trying = $derived(plugin ? plugins.get(plugin.pluginId)?.source === "draft" : false);
  const status = $derived(plugin ? latestStatus(plugin) : null);

  // Save a moment after typing stops.
  $effect(() => {
    if (!dirty) return;
    saveState = "unsaved";
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  });

  async function save(): Promise<boolean> {
    if (!plugin || !dirty) return true;
    if (!name.trim()) {
      saveState = "error";
      saveError = "Give it a name.";
      return false;
    }
    const snapshot = { name, description, source };
    saveState = "saving";
    try {
      const updated = await pluginsApi.save(
        plugin.pluginId,
        { name: snapshot.name.trim(), description: snapshot.description.trim(), needs: needs ?? undefined, version: nextVersion(plugin) },
        snapshot.source,
        plugin.draftUpdatedAtMs,
      );
      plugin = updated;
      saved = snapshot;
      saveState = dirty ? "unsaved" : "saved";
      saveError = null;
      // Trying it on the phone: the phone gets this version at its next sync.
      if (trying && updated.draftManifest) await plugins.install(updated.draftManifest, "draft").catch(() => {});
      return true;
    } catch (e) {
      saveState = "error";
      saveError = e instanceof Error ? e.message : "Couldn't save";
      return false;
    }
  }

  // Checks, a moment after the code changes.
  $effect(() => {
    const src = source;
    const fam = family;
    const id = plugin?.pluginId;
    if (!id) return;
    const t = setTimeout(async () => {
      checking = true;
      try {
        const result = await runPluginChecks({
          family: fam,
          pluginId: id,
          source: src,
          run: (s, e, op) => runInSandbox(s, e, op),
        });
        if (src === source) checks = result;
      } finally {
        checking = false;
      }
    }, 500);
    return () => clearTimeout(t);
  });

  function toggleNeed(need: string, on: boolean) {
    const current = needs ?? [];
    const next = on ? [...current, need] : current.filter((n) => n !== need);
    const rewritten = writeNeedsToSource(source, next);
    if (rewritten !== null) source = rewritten;
  }

  function onKeydown(e: KeyboardEvent) {
    // Tab indents instead of leaving the editor; Escape then Tab still moves on.
    if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const ta = e.currentTarget as HTMLTextAreaElement;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = ta;
    source = source.slice(0, a) + "  " + source.slice(b);
    requestAnimationFrame(() => ta.setSelectionRange(a + 2, a + 2));
  }

  async function upload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    for (const f of files) {
      const text = await f.text();
      if (f.name === "manifest.json") {
        try {
          const m = JSON.parse(text) as { name?: string; description?: string };
          if (m.name) name = m.name;
          if (typeof m.description === "string") description = m.description;
        } catch {
          toast.error("manifest.json isn't valid JSON");
        }
      } else {
        source = text;
      }
    }
    if (files.length) toast.success(files.length === 1 ? `Loaded ${files[0]!.name}` : `Loaded ${files.length} files`);
  }

  async function tryOnPhone() {
    if (!plugin || !(await save())) return;
    const fresh = plugin.draftManifest ? plugin : await pluginsApi.get(plugin.pluginId);
    if (!fresh.draftManifest) return;
    try {
      if (isCodeFamily(family) && !plugins.communityOn) await plugins.setCommunity(true);
      await plugins.install(fresh.draftManifest, "draft");
      toast.success("It's on your phone after its next sync, for your account only. Saving here updates it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't put it on your phone");
    }
  }

  async function stopTrying() {
    if (!plugin) return;
    await plugins.remove(plugin.pluginId).catch(() => {});
    toast.success("Taken off your phone at its next sync.");
  }

  async function openPublish(initial: "listed" | "link" | "files") {
    if (!(await save())) return;
    publishInitial = initial;
    publishOpen = true;
  }

  async function remove() {
    if (!plugin) return;
    try {
      if (trying) await plugins.remove(plugin.pluginId).catch(() => {});
      await pluginsApi.remove(plugin.pluginId);
      deleteOpen = false;
      toast.success("Deleted");
      await goto("/plugins?tab=mine");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete it");
    }
  }

  const manifestPreview = $derived(
    JSON.stringify(
      {
        id: plugin?.pluginId,
        family,
        name,
        description,
        version: plugin ? nextVersion(plugin) : "1.0.0",
        author,
        ...(needs ? { needs } : {}),
        integrity: "(added when you publish)",
      },
      null,
      2,
    ),
  );

  const btn = "inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-border px-3 text-[13px] font-medium whitespace-nowrap disabled:opacity-50";
  const btnPri = "inline-flex h-[34px] items-center gap-1.5 rounded-[9px] bg-primary px-3 text-[13px] font-semibold whitespace-nowrap text-primary-foreground disabled:opacity-50";
  const input = "h-[34px] w-full rounded-[9px] border border-border bg-background px-2.5 text-[13px]";
  const SAVE_LABEL = { saved: "Draft · saved", saving: "Saving…", unsaved: "Draft · not saved yet", error: "Not saved" } as const;
</script>

{#if isNew}
  <div class="flex flex-col gap-4">
    <PageCrumbs crumbs={[{ label: "Plugins", href: "/plugins" }, { label: "My plugins", href: "/plugins?tab=mine" }, { label: isNew ? "New plugin" : name || plugin?.pluginId || "Plugin" }]} />
    <section class="mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-[12px] border border-border bg-card p-6">
      <div>
        <h1 class="text-xl font-bold">New plugin</h1>
        <p class="mt-1 text-[13px] text-muted-foreground">It starts as a small working example of the type you pick, so you can see it run before you change anything.</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="np-name" class="text-xs font-medium text-muted-foreground">Name</label>
        <input id="np-name" bind:value={newName} maxlength="60" placeholder="Weekly swings" class={input} />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="np-family" class="text-xs font-medium text-muted-foreground">Type</label>
        <OptionSelect id="np-family" class="w-full" bind:value={newFamily}
          options={PLUGIN_FAMILIES.map((f) => ({ value: f, label: FAMILY_LABELS[f] ?? f }))} />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="np-id" class="text-xs font-medium text-muted-foreground">Id</label>
        <input id="np-id" bind:value={newId} oninput={() => (idTouched = true)} class="{input} font-mono" />
        <span class="text-xs text-muted-foreground">Unique on LogIt and can't change later. Lower case, like com.yourname.weekly-swings.</span>
      </div>
      {#if createError}<p class="text-[13px] text-destructive">{createError}</p>{/if}
      <div class="flex justify-end gap-2">
        <a href="/plugins?tab=mine" class={btn}>Cancel</a>
        <button type="button" disabled={!newName.trim() || creating} onclick={create} class={btnPri}>Create</button>
      </div>
    </section>
  </div>
{:else if loadError}
  <div class="flex flex-col gap-3">
    <PageCrumbs crumbs={[{ label: "Plugins", href: "/plugins" }, { label: "My plugins", href: "/plugins?tab=mine" }, { label: isNew ? "New plugin" : name || plugin?.pluginId || "Plugin" }]} />
    <Alert.Root variant="destructive"><Alert.Description>{loadError}</Alert.Description></Alert.Root>
  </div>
{:else if !plugin}
  <Skeleton class="h-[600px]" />
{:else}
  <div class="flex flex-col gap-3.5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <PageCrumbs crumbs={[{ label: "Plugins", href: "/plugins" }, { label: "My plugins", href: "/plugins?tab=mine" }, { label: isNew ? "New plugin" : name || plugin?.pluginId || "Plugin" }]} />
        <h1 class="text-[15px] font-semibold">{name || plugin.pluginId}</h1>
        <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {saveState === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-sky-500/15 text-sky-700 dark:text-sky-200'}" aria-live="polite">{SAVE_LABEL[saveState]}</span>
        {#if status}<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {status.tone}">{STATUS_LABEL[status.release.status]} {status.release.version}</span>{/if}
        {#if trying}<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span class="h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden="true"></span>On your phone to try</span>{/if}
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btn} onclick={() => openPublish("files")}>Download files</button>
        {#if trying}
          <button type="button" class={btn} onclick={stopTrying}>Stop trying on phone</button>
        {:else}
          <button type="button" class={btn} disabled={!checks?.ok} title={checks?.ok ? undefined : "Fix the checks first"} onclick={tryOnPhone}>Try on my phone</button>
        {/if}
        <button type="button" class={btnPri} disabled={!checks?.ok || checking} title={checks?.ok ? undefined : "Fix the checks first"} onclick={() => openPublish("listed")}>Publish…</button>
      </div>
    </header>
    {#if saveError}<p class="text-[13px] text-destructive">{saveError}</p>{/if}
    {#if status?.release.status === "rejected" && status.release.reviewNote}
      <Alert.Root><Alert.Description><strong>LogIt asked for a change to {status.release.version}:</strong> {status.release.reviewNote}</Alert.Description></Alert.Root>
    {/if}

    <div class="flex flex-wrap items-start gap-3.5">
      <!-- About -->
      <aside class="flex flex-[1_1_240px] flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-[13px] font-semibold">About this plugin</h2>
        <div class="flex flex-col gap-1.5"><label for="b-name" class="text-xs font-medium text-muted-foreground">Name</label><input id="b-name" bind:value={name} maxlength="60" class={input} /></div>
        <div class="flex flex-col gap-1.5"><span class="text-xs font-medium text-muted-foreground">Type</span><span class="text-[13px]">{FAMILY_LABELS[family]}</span></div>
        <div class="flex flex-col gap-1.5"><label for="b-desc" class="text-xs font-medium text-muted-foreground">Description</label><textarea id="b-desc" bind:value={description} rows="3" maxlength="500" class="rounded-[9px] border border-border bg-background px-2.5 py-2 text-[13px]"></textarea></div>
        {#if family === "widget"}
          <fieldset class="flex flex-col gap-1.5" disabled={needs === null}>
            <legend class="pb-1.5 text-xs font-medium text-muted-foreground">What it gets</legend>
            {#each WIDGET_NEEDS as n (n.need)}
              <label class="flex items-start gap-2 text-[13px] leading-snug" title={n.detail}>
                <Checkbox checked={needs?.includes(n.need) ?? false} onCheckedChange={(v) => toggleNeed(n.need, v)} class="mt-0.5" />
                {n.label}
              </label>
            {/each}
          </fieldset>
          <p class="text-xs leading-normal text-muted-foreground">
            {needs === null ? "Add one needs: [...] list to the code to tick these here." : "This is the needs list in the code; ticking here changes it. People see it before they install."}
          </p>
        {/if}
        <p class="font-mono text-[11px] break-all text-muted-foreground">{plugin.pluginId}</p>
        <button type="button" class="self-start text-xs text-destructive underline underline-offset-4" onclick={() => (deleteOpen = true)}>Delete plugin</button>
      </aside>

      <!-- Editor -->
      <section class="flex min-w-0 flex-[999_1_460px] flex-col overflow-hidden rounded-[10px] border border-border bg-card">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-2 pt-1.5">
          <Tabs.Root value={view} onValueChange={(v) => (view = v as "code" | "manifest")} class="w-auto">
            <Tabs.List variant="line" aria-label="File" class="w-auto gap-0.5 border-b-0">
              <Tabs.Trigger value="code" class="h-auto py-2 text-xs data-[state=active]:font-medium">{sourceFileName(family)}</Tabs.Trigger>
              <Tabs.Trigger value="manifest" class="h-auto py-2 text-xs data-[state=active]:font-medium">manifest.json</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
          <span class="flex items-center gap-2 pb-1.5">
            <label for="b-upload" class="inline-flex h-7 cursor-pointer items-center rounded-[8px] border border-border px-2.5 text-xs">Upload files…</label>
            <input id="b-upload" type="file" multiple accept=".js,.mjs,.json" class="sr-only" onchange={upload} />
            <a href="https://getlogit.app/docs/plugins/{family === 'widget' ? 'widgets' : family.includes('pack') ? (family === 'mobility-pack' ? 'mobility-packs' : 'exercise-packs') : family === 'analytics' ? 'analytics' : family.startsWith('nutrition') ? 'nutrition' : family === 'mobility-progression' ? 'mobility-progression' : 'progression'}" target="_blank" rel="noopener" class="inline-flex h-7 items-center rounded-[8px] border border-border px-2.5 text-xs">Docs</a>
          </span>
        </div>
        {#if view === "code"}
          <label for="b-code" class="sr-only">Code</label>
          <textarea id="b-code" bind:value={source} onkeydown={onKeydown} wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off"
            style="min-height: 560px; line-height: 1.7; tab-size: 2"
            class="w-full resize-y bg-transparent px-[18px] py-4 font-mono text-[12.5px] outline-none"></textarea>
        {:else}
          <pre style="min-height: 560px; line-height: 1.7" class="overflow-auto px-[18px] py-4 font-mono text-[12.5px]">{manifestPreview}</pre>
          <p class="border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground">Made from the details on the left; the hash and download links are added when you publish.</p>
        {/if}
      </section>

      <!-- Preview + checks -->
      <aside class="flex flex-[1_1_300px] flex-col gap-3.5">
        {#if isCodeFamily(family)}
          <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-[13px] font-semibold">Preview</h2>
              <div role="group" aria-label="Preview data" class="flex gap-0.5 rounded-[9px] bg-muted p-0.5">
                {#each [["mine", "My data"], ["sample", "Sample"], ["empty", "Empty"]] as [v, l] (v)}
                  <button type="button" aria-pressed={data === v} onclick={() => (data = v as typeof data)} class="h-7 rounded-[7px] px-2.5 text-xs {data === v ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}">{l}</button>
                {/each}
              </div>
            </div>
            {#if family !== "widget" && data === "mine"}
              <p class="text-xs text-muted-foreground">Uses sample data: {FAMILY_LABELS[family]?.toLowerCase()} plugins run on one exercise or day at a time in the app.</p>
            {/if}
            <PluginPreview {family} {source} data={family !== "widget" && data === "mine" ? "sample" : data} />
            {#if family === "widget"}<p class="text-xs text-muted-foreground">Drawn by the same parts as the Overview and the phone.</p>{/if}
          </section>
        {/if}
        <section class="flex flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4" aria-live="polite">
          <h2 class="pb-1.5 text-[13px] font-semibold">Checks{checking ? " …" : ""}</h2>
          {#if !checks}
            <Skeleton class="h-24" />
          {:else}
            {#each checks.checks as c (c.id)}
              <div class="flex items-start gap-2 py-1 text-[12.5px]">
                <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {c.ok ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-destructive/15 text-destructive'}" aria-hidden="true">{c.ok ? "✓" : "!"}</span>
                <span class="min-w-0"><span class="sr-only">{c.ok ? "Passed:" : "Failed:"}</span>{c.label}{#if c.detail}<br /><span class="text-xs whitespace-pre-wrap text-muted-foreground">{c.detail}</span>{/if}</span>
              </div>
            {/each}
            <p class="pt-1.5 text-xs leading-normal text-muted-foreground">The same ground the registry checks cover, so publishing has no surprises.</p>
          {/if}
        </section>
      </aside>
    </div>
  </div>

  <PublishDialog bind:open={publishOpen} {plugin} {name} {description} needs={needs ?? []} {source} {author} initial={publishInitial}
    onPublished={(p) => (plugin = p)} />

  <Dialog.Root bind:open={deleteOpen}>
    <Dialog.Content class="sm:max-w-[420px]">
      <Dialog.Header>
        <Dialog.Title>Delete {name || plugin.pluginId}?</Dialog.Title>
        <Dialog.Description>The draft and every published version go, and it leaves Browse. People who installed it keep their copy. This can't be undone.</Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <button type="button" onclick={() => (deleteOpen = false)} class={btn}>Cancel</button>
        <button type="button" onclick={remove} class="inline-flex h-[34px] items-center rounded-[9px] bg-destructive px-3 text-[13px] font-semibold text-white">Delete</button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}
