<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { plugins } from "./pluginData.svelte";

  /**
   * The community plugins switch, for the whole account (phone and dashboard). Off: a banner
   * with "Turn on…". On: a slim line with "Turn off".
   */
  let { compact = false }: { compact?: boolean } = $props();
  let open = $state(false);
  let busy = $state(false);

  async function set(on: boolean) {
    busy = true;
    try {
      await plugins.setCommunity(on);
      open = false;
      toast.success(on ? "Community plugins are on, here and on your phone." : "Community plugins are off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      busy = false;
    }
  }
</script>

{#if plugins.community && !plugins.communityOn}
  <section class="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-amber-500/35 bg-amber-500/5 px-[18px] py-4">
    <span class="flex flex-[1_1_420px] flex-col gap-1">
      <span class="text-sm font-semibold">Community plugins are off</span>
      <span class="text-[13px] leading-normal text-muted-foreground">
        Packs and workout blocks always install. Plugins that run code (widgets, progression, analytics) need this on.
        One switch for your account, so it's the same on your phone.
      </span>
    </span>
    <button type="button" onclick={() => (open = true)} class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium">Turn on…</button>
  </section>
{:else if plugins.communityOn && !compact}
  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
    <span>Community plugins are on for your account.</span>
    <button type="button" disabled={busy} onclick={() => set(false)} class="underline underline-offset-4 hover:text-foreground">Turn off</button>
  </div>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[440px]">
    <Dialog.Header>
      <Dialog.Title>Turn on community plugins?</Dialog.Title>
      <Dialog.Description>
        Community widgets, progression and analytics plugins run their own code inside LogIt, in a sandbox: no internet,
        no storage, and only the data each one lists. Only turn this on if you trust the plugins you install. You can turn it
        off any time, and each plugin has its own switch too.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <button type="button" onclick={() => (open = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" disabled={busy} onclick={() => set(true)} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Turn on</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
