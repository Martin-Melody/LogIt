<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import type { WidgetPlugin, WidgetView } from "@logit/core/plugins/widgetView";
  import { onForeground } from "$lib/lifecycle";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { selectedDayOverride } from "$lib/stores/todaysPlan.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { habitsRevision } from "$lib/features/habits/store";
  import { lastSyncedAt } from "$lib/sync/syncService";
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

  // Runs on mount, then again whenever a reactive widget's inputs change (split day switched,
  // a session started/finished), and whenever a background sync completes — otherwise a
  // widget mounted before login's sync finishes (or before any later background sync lands)
  // just sits on stale/empty data until the user leaves the Home screen and comes back,
  // which is the only other thing that currently re-triggers load() (onForeground below).
  $effect(() => {
    void $lastSyncedAt;
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


<!--
  Wrapper stays mounted across every state (empty → loaded, or one view swapped for a
  differently-sized one after a sync); only what's *inside* it changes. That's what lets
  `transition: height/width` actually play — a transition needs the same element present on
  both sides of the change, not a node that simply didn't exist a moment ago. `interpolate-size:
  allow-keywords` is what makes an intrinsic (auto) height/width transitionable at all here;
  without it this box-sizing pattern wouldn't animate anything, height would still just snap.
-->
<div class="widget-card-animate">
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
</div>

<style>
  .widget-card-animate {
    interpolate-size: allow-keywords;
    overflow: hidden;
    transition:
      height 550ms cubic-bezier(0.22, 1, 0.36, 1),
      width 550ms cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
