<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import type { ServedManifest } from "@logit/core/api/pluginsApi";
  import type { PluginInstallSource } from "@logit/core/plugins/pluginInstalls";
  import { familyLabel, isCodeFamily, pluginCan, pluginGets } from "@logit/core/plugins/pluginInfo";
  import { plugins } from "./pluginData.svelte";

  /**
   * "Install X?": what it gets and can do, then install on every device. A code plugin while
   * community plugins are off offers to turn them on in the same step.
   */
  let {
    manifest = $bindable(null),
    source = "registry",
    reviewed = true,
    onInstalled,
  }: {
    manifest: ServedManifest | null;
    source?: PluginInstallSource;
    reviewed?: boolean;
    onInstalled?: () => void;
  } = $props();

  let busy = $state(false);
  const needsSwitch = $derived(!!manifest && isCodeFamily(manifest.family) && !plugins.communityOn);
  const replacing = $derived(manifest ? plugins.get(manifest.id) : null);

  async function install(turnOn: boolean) {
    if (!manifest) return;
    busy = true;
    try {
      if (turnOn) await plugins.setCommunity(true);
      await plugins.install(manifest, source);
      toast.success(`${manifest.name} is installed. It's on your phone after its next sync.`);
      manifest = null;
      onInstalled?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't install it");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root open={!!manifest} onOpenChange={(o) => { if (!o) manifest = null; }}>
  <Dialog.Content class="sm:max-w-[460px]">
    {#if manifest}
      <Dialog.Header>
        <Dialog.Title>{replacing ? `Update ${manifest.name} to ${manifest.version}?` : `Install ${manifest.name}?`}</Dialog.Title>
        <Dialog.Description>
          {familyLabel(manifest.family)}{manifest.author ? ` · by ${manifest.author}` : ""} · {manifest.version}{reviewed ? "" : " · not reviewed by LogIt"}
        </Dialog.Description>
      </Dialog.Header>
      {#if manifest.description}<p class="text-sm leading-normal text-muted-foreground">{manifest.description}</p>{/if}
      <div class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">It gets</span>
        {#if isCodeFamily(manifest.family)}
          {#each pluginGets(manifest.family, manifest.needs) as g (g.label)}
            <div class="flex gap-2.5 text-sm"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true"></span><span><span class="font-medium">{g.label}</span><br /><span class="text-muted-foreground">{g.detail}</span></span></div>
          {/each}
          <span class="text-xs text-muted-foreground">No internet, no storage, nothing else.</span>
        {:else}
          <span class="text-sm text-muted-foreground">Nothing: it's data, and runs no code.</span>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">It can</span>
        {#each pluginCan(manifest.family) as c (c)}<span class="text-sm">{c}</span>{/each}
      </div>
      {#if !reviewed}
        <p class="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-normal text-amber-800 dark:text-amber-200">
          Shared by link: LogIt hasn't looked at this one. Install it only if you trust {manifest.author ?? "who sent it"}.
        </p>
      {/if}
      {#if needsSwitch}
        <p class="text-xs leading-normal text-muted-foreground">Community plugins are off for your account, so it won't run until you turn them on.</p>
      {/if}
      <Dialog.Footer>
        <button type="button" onclick={() => (manifest = null)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
        {#if needsSwitch}
          <button type="button" disabled={busy} onclick={() => install(false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Install, leave off</button>
          <button type="button" disabled={busy} onclick={() => install(true)} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Turn on and install</button>
        {:else}
          <button type="button" disabled={busy} onclick={() => install(false)} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{replacing ? "Update" : "Install"}</button>
        {/if}
      </Dialog.Footer>
      <p class="text-center text-xs text-muted-foreground">Goes on your phone and here.</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
