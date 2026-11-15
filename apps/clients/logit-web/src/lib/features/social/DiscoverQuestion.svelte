<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type SocialSettings } from "@logit/core/api/socialApi";

  // Accounts from before Discover are asked once whether their posts may appear there.
  let { settings = $bindable() }: { settings: SocialSettings } = $props();
  let busy = $state(false);

  async function answer(show: boolean) {
    busy = true;
    try {
      settings = await socialApi.updateSettings({ showInDiscover: show });
    } catch {
      toast.error("Couldn't save that");
    } finally {
      busy = false;
    }
  }
</script>

{#if settings.showInDiscover === null && !settings.isPrivate}
  <section class="flex flex-col gap-2.5 rounded-[10px] border border-sky-500/40 bg-sky-500/5 px-[18px] py-4">
    <h2 class="text-sm font-semibold">Discover is here</h2>
    <p class="text-[13px] leading-relaxed text-muted-foreground">People who don't follow you yet can find posts in Discover. Should yours be there? Your followers see your posts either way, and you can change this under Privacy.</p>
    <div class="flex gap-2">
      <button type="button" disabled={busy} onclick={() => answer(true)} class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Yes, show my posts</button>
      <button type="button" disabled={busy} onclick={() => answer(false)} class="h-8 rounded-[9px] border border-border px-3 text-xs disabled:opacity-50">No, followers only</button>
    </div>
  </section>
{/if}
