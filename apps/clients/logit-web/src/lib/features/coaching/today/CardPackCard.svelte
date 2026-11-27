<!-- A card from a card pack (canvas W13) on Today or Your month, run in the sandbox with your
     roster facts only. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { checkWidgetView } from "@logit/core/plugins/widgetViewCheck";
  import type { WidgetView } from "@logit/core/plugins/widgetView";
  import { plugins, fetchSource, runPlugin } from "$lib/features/plugins/pluginData.svelte";
  import WidgetViewRenderer from "$lib/features/plugins/render/WidgetViewRenderer.svelte";
  import { cardPackInput } from "./cardPacks.svelte";
  import type { CoachingOverview } from "../coachingData";

  let { pluginId, cardId, page, overview }: { pluginId: string; cardId: string; page: "today" | "month"; overview: CoachingOverview } = $props();
  let view = $state<WidgetView | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const p = plugins.get(pluginId);
    view = null;
    error = null;
    if (!p) return void (error = "This card's plugin isn't installed any more. Edit cards to remove it.");
    const input = cardPackInput(overview, cardId, page);
    (async () => {
      const out = await runPlugin("card-pack", await fetchSource(p.manifest as never), input);
      const problems = checkWidgetView(out);
      if (problems.length) throw new Error(problems[0]);
      view = out as WidgetView;
    })().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
</script>

{#if view}
  <WidgetViewRenderer {view} />
{:else if error}
  <div class="rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px] text-muted-foreground">{error}</div>
{:else}
  <Skeleton class="h-28 rounded-[10px]" />
{/if}
