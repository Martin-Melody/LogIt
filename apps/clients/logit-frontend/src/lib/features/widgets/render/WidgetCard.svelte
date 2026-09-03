<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import type { WidgetPlugin, WidgetView } from "@logit/core/plugins/widgetView";
  import { onForeground } from "$lib/lifecycle";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { selectedDayOverride } from "$lib/stores/todaysPlan.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { habitsRevision } from "$lib/features/habits/store";
  import { gatherWidgetInput } from "./widgetInput";
  import WidgetViewRenderer from "./WidgetViewRenderer.svelte";

  /**
   * Hosts a WidgetView widget on the home screen: gathers the data it needs,
   * runs its compute() (a plain call for built-ins, a sandbox call for
   * community widgets), and renders the result.
   */
  const { plugin }: { plugin: WidgetPlugin } = $props();

  const reactive = $derived(
    plugin.needs.includes("session") || plugin.needs.includes("todaysPlan"),
  );

  let view = $state<WidgetView | null>(null);
  let error = $state(false);

  async function load() {
    try {
      const input = await gatherWidgetInput(plugin.needs);
      view = await plugin.compute(input);
      error = false;
    } catch (e) {
      console.warn("[widget]", plugin.id, "failed", e);
      error = true;
    }
  }

  // Runs on mount, then again whenever a reactive widget's inputs change
  // (split day switched, a session started/finished).
  $effect(() => {
    if (reactive) {
      void $activeSplit;
      void $selectedDayOverride;
      void $currentSession;
    }
    if (plugin.needs.includes("habits")) {
      void $habitsRevision;
    }
    void load();
  });

  onMount(() => onForeground(() => void load()));
</script>

{#if view}
  <WidgetViewRenderer {view} />
{:else if error}
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>{plugin.name}</Card.Title>
      <Card.Description>This widget couldn't load.</Card.Description>
    </Card.Header>
  </Card.Root>
{/if}
