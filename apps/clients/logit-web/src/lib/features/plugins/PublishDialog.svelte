<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { pluginsApi, type MyPlugin } from "@logit/core/api/pluginsApi";
  import { familyLabel, getsSummary, pluginCan } from "@logit/core/plugins/pluginInfo";
  import { computeIntegrity } from "@logit/core/plugins/integrity";
  import { sourceFileName } from "@logit/core/plugins/pluginTemplates";
  import { nextVersion } from "./myPlugins";

  /**
   * Publish: everyone in Browse (after a LogIt review), people with the link (now, not
   * reviewed), or just the files for your own registry.
   */
  let {
    open = $bindable(false),
    plugin,
    name,
    description,
    needs,
    source,
    author,
    initial = "listed",
    onPublished,
  }: {
    open: boolean;
    initial?: "listed" | "link" | "files";
    plugin: MyPlugin;
    name: string;
    description: string;
    needs: string[];
    source: string;
    author: string;
    onPublished: (p: MyPlugin) => void;
  } = $props();

  type Who = "listed" | "link" | "files";
  let who = $state<Who>("listed");
  let version = $state("");
  let note = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let shareUrl = $state<string | null>(null);

  $effect(() => {
    if (open) {
      who = initial;
      version = nextVersion(plugin);
      note = plugin.releases.length ? "" : "First version.";
      error = null;
      shareUrl = null;
    }
  });

  function download(fileName: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** manifest.json + the code, laid out the way a registry repo expects (plugins/<id>/...). */
  async function downloadFiles(v: string) {
    const file = sourceFileName(plugin.family);
    const base = `plugins/${plugin.pluginId}`;
    const manifest = {
      id: plugin.pluginId,
      family: plugin.family,
      name,
      description,
      version: v,
      author,
      ...(plugin.family === "widget" ? { needs } : {}),
      integrity: await computeIntegrity(source),
      distribution: { origin: "url", manifestUrl: `${base}/manifest.json`, bundleUrl: `${base}/${file}` },
      capabilities: [capability()],
    };
    download("manifest.json", JSON.stringify(manifest, null, 2) + "\n", "application/json");
    setTimeout(() => download(file, source, file.endsWith(".js") ? "text/javascript" : "application/json"), 300);
  }

  function capability(): Record<string, unknown> {
    const id = plugin.pluginId;
    switch (plugin.family) {
      case "widget": return { family: "widget", widgetId: id, slot: "home", defaultEnabled: true, defaultOrder: 100 };
      case "analytics":
      case "nutrition-analytics": return { family: plugin.family, analyticsId: id };
      case "exercise-pack": return { family: plugin.family, exercisePackId: id };
      case "mobility-pack": return { family: plugin.family, mobilityPackId: id };
      default: return { family: plugin.family, algorithmId: id };
    }
  }

  async function submit() {
    busy = true;
    error = null;
    try {
      if (who === "files") {
        await downloadFiles(version);
        open = false;
        return;
      }
      const updated = await pluginsApi.publish(plugin.pluginId, version.trim(), note, who === "listed");
      onPublished(updated);
      if (who === "link" && updated.linkToken) {
        shareUrl = `${location.origin}/plugins/link/${updated.linkToken}`;
      } else {
        open = false;
        toast.success("Sent for review. You'll get an email when it's listed, or a note on what to change.");
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't publish it";
    } finally {
      busy = false;
    }
  }

  async function copy() {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl).catch(() => {});
    toast.success("Link copied");
  }

  const OPTIONS: [Who, string, string][] = [
    ["listed", "Everyone, in Browse", "LogIt looks at it first, usually within a few days. You get an email when it's listed, or a note on what to change."],
    ["link", "People with the link", "Not in Browse and not reviewed. Good for friends or your clients. They see an \"unreviewed\" warning before installing."],
    ["files", "Just download the files", "manifest.json and the code with the hash filled in, for your own registry or a pull request to the community one."],
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[600px]">
    <Dialog.Header>
      <Dialog.Title>{shareUrl ? `${name} ${version} is shared` : `Publish ${name}`}</Dialog.Title>
      <Dialog.Description>{shareUrl ? "Anyone with this link can install it. Newer versions you share by link use the same link." : "All checks pass. Choose who can get it."}</Dialog.Description>
    </Dialog.Header>

    {#if shareUrl}
      <div class="flex flex-wrap items-center gap-2">
        <label for="share-url" class="sr-only">Share link</label>
        <input id="share-url" readonly value={shareUrl} class="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 font-mono text-xs" />
        <button type="button" onclick={copy} class="h-9 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Copy</button>
      </div>
      <Dialog.Footer>
        <button type="button" onclick={() => (open = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Done</button>
      </Dialog.Footer>
    {:else}
      <fieldset class="flex flex-col gap-2.5">
        <legend class="sr-only">Who can get it</legend>
        {#each OPTIONS as [value, title, text] (value)}
          <label class="flex cursor-pointer items-start gap-3 rounded-[10px] border p-3.5 {who === value ? 'border-primary bg-primary/5' : 'border-border'}">
            <input type="radio" name="publish-who" {value} bind:group={who} class="mt-1" />
            <span class="flex flex-col gap-0.5"><span class="text-sm font-semibold">{title}</span><span class="text-[13px] leading-normal text-muted-foreground">{text}</span></span>
          </label>
        {/each}
      </fieldset>

      <div class="flex flex-wrap gap-3">
        <div class="flex flex-[0_1_140px] flex-col gap-1.5">
          <label for="pub-version" class="text-xs font-medium text-muted-foreground">Version</label>
          <input id="pub-version" bind:value={version} class="h-9 rounded-lg border border-border bg-background px-2.5 text-[13px]" />
        </div>
        {#if who !== "files"}
          <div class="flex flex-[1_1_280px] flex-col gap-1.5">
            <label for="pub-note" class="text-xs font-medium text-muted-foreground">What's new</label>
            <textarea id="pub-note" bind:value={note} rows="2" maxlength="2000" class="rounded-lg border border-border bg-background px-2.5 py-2 text-[13px]"></textarea>
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-1 rounded-[10px] bg-muted px-3.5 py-3 text-[13px]">
        <span class="font-semibold">People will see</span>
        <span class="text-muted-foreground">{familyLabel(plugin.family)} · by {author} · Gets: {getsSummary(plugin.family, needs)} · Can: {pluginCan(plugin.family)[0]?.toLowerCase()}</span>
      </div>

      {#if error}<p class="text-[13px] text-destructive">{error}</p>{/if}

      <Dialog.Footer class="items-center">
        <span class="mr-auto text-xs text-muted-foreground">{who === "files" ? "Nothing is sent anywhere." : "Published versions can't be changed, only replaced by a newer one."}</span>
        <button type="button" onclick={() => (open = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
        <button type="button" disabled={busy || !version.trim()} onclick={submit} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
          {who === "listed" ? "Send for review" : who === "link" ? "Publish and get the link" : "Download"}
        </button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
