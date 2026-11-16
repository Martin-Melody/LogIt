<script lang="ts">
  import type { WidgetView } from "@logit/core/plugins/widgetView";
  import type { WidgetDataNeed } from "@logit/core/plugins/widgetView";
  import { checkWidgetView } from "@logit/core/plugins/widgetViewCheck";
  import { isWidgetNeed } from "@logit/core/plugins/pluginInfo";
  import { fetchSource, pluginMeta, runPlugin, type Installed } from "./pluginData.svelte";
  import { gatherWebWidgetInput } from "./webWidgetInput";
  import WidgetViewRenderer from "./render/WidgetViewRenderer.svelte";

  /** An installed widget plugin on the Overview: your synced data in, its card out. */
  const { plugin }: { plugin: Installed } = $props();

  let view = $state<WidgetView | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const p = plugin;
    view = null;
    error = null;
    (async () => {
      const source = await fetchSource(p.manifest as never);
      const meta = await pluginMeta(p.manifest.family, source);
      const needs = (Array.isArray(meta?.needs) ? meta.needs : []).filter((n): n is WidgetDataNeed => typeof n === "string" && isWidgetNeed(n));
      const out = await runPlugin(p.manifest.family, source, await gatherWebWidgetInput(needs));
      const problems = checkWidgetView(out);
      if (problems.length) throw new Error(problems[0]);
      view = out as WidgetView;
    })().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
</script>

{#if view}
  <WidgetViewRenderer {view} framed={false} header={false} />
{:else if error}
  <p class="text-[13px] text-muted-foreground">This plugin didn't load: {error}</p>
{:else}
  <div class="h-14 animate-pulse rounded-lg bg-muted"></div>
{/if}
