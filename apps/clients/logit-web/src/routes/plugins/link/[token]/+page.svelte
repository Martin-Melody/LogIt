<script lang="ts">
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { pluginsApi, type LinkedPlugin } from "@logit/core/api/pluginsApi";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import PluginDetail from "$lib/features/plugins/PluginDetail.svelte";

  // A plugin someone shared by link: not in Browse, maybe not reviewed.
  let data = $state<LinkedPlugin | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const token = page.params.token ?? "";
    data = null;
    error = null;
    pluginsApi.byLink(token).then((d) => (data = d), (e) => (error = e instanceof Error ? e.message : "Couldn't load it"));
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
  });
</script>

{#if error}
  <div class="flex flex-col gap-3">
    <a href="/plugins" class="text-[13px] text-muted-foreground hover:text-foreground">‹ Plugins</a>
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  </div>
{:else if !data}
  <Skeleton class="h-80" />
{:else}
  <PluginDetail manifest={data.manifest} reviewed={data.reviewed} source={data.reviewed ? "registry" : "link"} changeNote={data.changeNote} backLabel="Plugins" />
{/if}
