<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { SlidersHorizontal } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { homeConfig } from "$lib/stores/homeConfig.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
  import { startHomeTour } from "$lib/tour/index";
  import { pluginRuntime, type RuntimeWidgetDefinition } from "$lib/plugins";

  let widgets = $state<RuntimeWidgetDefinition[]>(
    localWidgetRegistry.list().map((widget) => ({
      ...widget,
      source: "builtin" as const,
      pluginEnabled: true,
      bundleContract: null,
    })),
  );

  const activeWidgets = $derived(
    [...$homeConfig.slots]
      .filter((s) => s.enabled)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => widgets.find((w) => w.id === s.id))
      .filter(
        (w): w is RuntimeWidgetDefinition => w !== undefined && w.pluginEnabled,
      ),
  );

  onMount(() => {
    void homeConfig.reconcilePlugins();
    void pluginRuntime.listWidgets().then((loaded) => {
      widgets = loaded;
    });

    // Small delay so widgets render before the tour tries to find them
    setTimeout(() => {
      if ($onboarding.completed) startHomeTour();
    }, 400);
  });
</script>

<div class="flex flex-col gap-2 p-3 pb-24">
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold">Home</h1>
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      aria-label="Customise home"
      data-tour="home-customize"
      onclick={() => void goto("/home/customize")}
    >
      <SlidersHorizontal class="h-4 w-4" />
    </Button>
  </div>

  {#each activeWidgets as widget (widget.id)}
    {@const WidgetComponent = widget.component}
    <WidgetComponent {...(widget.props ?? {})} />
  {/each}
</div>
