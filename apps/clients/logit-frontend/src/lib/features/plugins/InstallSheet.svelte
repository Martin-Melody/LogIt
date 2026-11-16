<script lang="ts">
  import { Drawer } from "vaul-svelte";
  import { isCodeFamily, pluginCan, pluginGets, familyLabel } from "@logit/core/plugins/pluginInfo";
  import { pluginSettings } from "$lib/plugins";

  /**
   * "Install X?" before anything is downloaded: what it gets, what it can do, and (for a
   * plugin that runs code while community plugins are off) turning them on in the same tap.
   */
  type Target = {
    name: string;
    family: string;
    author?: string;
    version?: string;
    description?: string;
    needs?: string[] | null;
    reviewed?: boolean;
  };

  let {
    target,
    busy = false,
    error = null,
    onInstall,
    onClose,
  }: {
    target: Target | null;
    busy?: boolean;
    error?: string | null;
    onInstall: () => void;
    onClose: () => void;
  } = $props();

  const needsSwitch = $derived(!!target && isCodeFamily(target.family) && !$pluginSettings.communityPluginsEnabled);

  function install() {
    if (needsSwitch) pluginSettings.enableCommunityPlugins();
    onInstall();
  }
</script>

<Drawer.Root open={!!target} onOpenChange={(v) => { if (!v) onClose(); }} shouldScaleBackground={false}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-40 bg-black/50" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl border-t border-border bg-background">
      <!-- Gives the drawer something to focus first, like the other sheets. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <span tabindex="0" aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"></span>
      <div class="mx-auto mb-2 mt-3 h-1 w-10 shrink-0 rounded-full bg-muted"></div>
      {#if target}
        <div class="flex flex-col gap-4 overflow-y-auto px-[18px] pb-7">
          <div>
            <Drawer.Title class="text-lg font-bold">Install {target.name}?</Drawer.Title>
            <Drawer.Description class="mt-1 text-xs text-muted-foreground">
              {familyLabel(target.family)}{target.author ? ` · by ${target.author}` : ""}{target.version ? ` · ${target.version}` : ""}{target.reviewed ? " · Reviewed" : ""}
            </Drawer.Description>
          </div>
          {#if target.description}<p class="text-sm leading-normal text-muted-foreground">{target.description}</p>{/if}
          <div class="flex flex-col gap-2">
            <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">It gets</p>
            {#if isCodeFamily(target.family)}
              {#each pluginGets(target.family, target.needs ?? undefined) as g (g.label)}
                <div class="flex gap-2.5 text-sm"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true"></span><span>{g.label}</span></div>
              {/each}
              <p class="text-xs text-muted-foreground">No internet, no storage, nothing else.</p>
            {:else}
              <p class="text-sm text-muted-foreground">Nothing: it's data and runs no code.</p>
            {/if}
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">It can</p>
            {#each pluginCan(target.family) as c (c)}<p class="text-sm">{c}</p>{/each}
          </div>
          {#if needsSwitch}
            <p class="text-xs leading-normal text-muted-foreground">Community plugins are off. Installing turns them on for your account (you can turn them off in Plugins).</p>
          {/if}
          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
          <button type="button" disabled={busy} onclick={install} class="h-12 w-full rounded-[11px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Installing…" : needsSwitch ? "Turn on and install" : "Install"}
          </button>
          <p class="-mt-2 text-center text-xs text-muted-foreground">Also appears on the web dashboard after the next sync</p>
        </div>
      {/if}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
