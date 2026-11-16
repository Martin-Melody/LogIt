<script lang="ts">
  import type { WidgetView } from "@logit/core/plugins/widgetView";
  import { checkWidgetView } from "@logit/core/plugins/widgetViewCheck";
  import { sampleFamilyInput, sampleWidgetInput } from "@logit/core/plugins/sampleInputs";
  import { isWidgetNeed } from "@logit/core/plugins/pluginInfo";
  import { onDestroy } from "svelte";
  import WidgetViewRenderer from "./render/WidgetViewRenderer.svelte";
  import { previewWidgetActions } from "./render/widgetAction";
  import { pluginMeta, runPlugin } from "./pluginData.svelte";
  import { gatherWebWidgetInput } from "./webWidgetInput";

  /**
   * Runs a plugin in the sandbox and shows what it returns: a widget as its card, the other
   * types as their result. Taps in the preview say what they'd do instead of doing it.
   */
  let { family, source, data = "mine" }: { family: string; source: string; data?: "mine" | "sample" | "empty" } = $props();

  const undo = previewWidgetActions();
  onDestroy(undo);

  let view = $state<WidgetView | null>(null);
  let output = $state<unknown>(undefined);
  let error = $state<string | null>(null);
  let running = $state(false);
  let run = 0;

  async function go(src: string, mode: typeof data) {
    const mine = ++run;
    running = true;
    try {
      const now = Date.now();
      let result: unknown;
      if (family === "widget") {
        const meta = await pluginMeta(family, src);
        const needs = (Array.isArray(meta?.needs) ? meta.needs : []).filter((n): n is string => typeof n === "string" && isWidgetNeed(n));
        const input = mode === "mine" ? await gatherWebWidgetInput(needs as never) : sampleWidgetInput(needs, now, mode === "empty");
        result = await runPlugin(family, src, input);
      } else {
        result = await runPlugin(family, src, sampleFamilyInput(family, now, mode === "empty"));
      }
      if (mine !== run) return;
      error = null;
      if (family === "widget") {
        const problems = checkWidgetView(result);
        view = problems.length ? null : (result as WidgetView);
        if (problems.length) error = problems[0]!;
      } else {
        output = result;
      }
    } catch (e) {
      if (mine !== run) return;
      error = e instanceof Error ? e.message : String(e);
      view = null;
      output = undefined;
    } finally {
      if (mine === run) running = false;
    }
  }

  // Re-run shortly after the code or the data choice changes.
  $effect(() => {
    const src = source;
    const mode = data;
    const t = setTimeout(() => void go(src, mode), 350);
    return () => clearTimeout(t);
  });
</script>

<div class="flex flex-col gap-2" aria-busy={running}>
  {#if error}
    <p class="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-normal whitespace-pre-wrap text-destructive">{error}</p>
  {/if}
  {#if family === "widget"}
    {#if view}
      <WidgetViewRenderer {view} />
    {:else if !error}
      <div class="h-28 animate-pulse rounded-[10px] bg-muted"></div>
    {/if}
  {:else if output !== undefined}
    <pre class="max-h-80 overflow-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed">{JSON.stringify(output, null, 2)}</pre>
  {/if}
</div>
