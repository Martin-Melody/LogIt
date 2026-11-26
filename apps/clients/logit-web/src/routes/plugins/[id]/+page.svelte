<script lang="ts">
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { pluginsApi, type ListedPlugin } from "@logit/core/api/pluginsApi";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import PluginDetail from "$lib/features/plugins/PluginDetail.svelte";

  // One plugin from Browse (reviewed and listed on this server).
  let data = $state<ListedPlugin | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = page.params.id ?? "";
    data = null;
    error = null;
    pluginsApi.listed(id).then((d) => (data = d), (e) => (error = e instanceof Error ? e.message : "Couldn't load it"));
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
  });
</script>

{#if error}
  <div class="flex flex-col gap-3">
    <PageCrumbs crumbs={[{ label: "Plugins", href: "/plugins" }, { label: data?.manifest.name ?? "Plugin" }]} />
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  </div>
{:else if !data}
  <Skeleton class="h-80" />
{:else}
  <PluginDetail manifest={data.manifest} reviewed={true} source="registry" versions={data.versions} />
{/if}
