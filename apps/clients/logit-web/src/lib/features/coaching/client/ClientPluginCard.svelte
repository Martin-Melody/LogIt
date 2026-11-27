<!-- A card from one of your widget plugins on a client's Overview (canvas W11): it gets only the
     data it declared and the client shares, up to the end of the period. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { WidgetDataNeed, WidgetView } from "@logit/core/plugins/widgetView";
  import { checkWidgetView } from "@logit/core/plugins/widgetViewCheck";
  import { isWidgetNeed } from "@logit/core/plugins/pluginInfo";
  import { fetchSource, pluginMeta, runPlugin, type Installed } from "$lib/features/plugins/pluginData.svelte";
  import WidgetViewRenderer from "$lib/features/plugins/render/WidgetViewRenderer.svelte";
  import { clientWidgetInput, missingShares } from "./clientCards";
  import type { ClientSummary } from "../coachingData";

  let { plugin, client, untilMs }: { plugin: Installed; client: ClientSummary; untilMs: number } = $props();
  let view = $state<WidgetView | null>(null);
  let error = $state<string | null>(null);
  let missing = $state<string[]>([]);

  $effect(() => {
    const p = plugin, c = client, until = untilMs;
    view = null;
    error = null;
    (async () => {
      const source = await fetchSource(p.manifest as never);
      const meta = await pluginMeta(p.manifest.family, source);
      const needs = (Array.isArray(meta?.needs) ? meta.needs : []).filter((n): n is WidgetDataNeed => typeof n === "string" && isWidgetNeed(n));
      missing = missingShares(needs, c.sharing);
      const out = await runPlugin(p.manifest.family, source, await clientWidgetInput(c, needs, until));
      const problems = checkWidgetView(out);
      if (problems.length) throw new Error(problems[0]);
      view = out as WidgetView;
    })().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
</script>

{#if view}
  <WidgetViewRenderer {view} />
  {#if missing.length}<p class="-mt-2 px-1 text-[11px] text-muted-foreground">{client.name.split(" ")[0]} doesn't share {missing.join(" or ")}, so this card leaves that out.</p>{/if}
{:else if error}
  <div class="rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px] text-muted-foreground">{plugin.manifest.name} didn't load: {error}</div>
{:else}
  <Skeleton class="h-32 rounded-[10px]" />
{/if}
