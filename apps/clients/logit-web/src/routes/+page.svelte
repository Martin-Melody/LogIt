<script lang="ts">
  import { apiClient } from "@logit/core/api/client";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import X from "@lucide/svelte/icons/x";
  import { flip } from "svelte/animate";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { createReorder, SLIDE_MS } from "$lib/reorder.svelte";
  import { loadOverview, type OverviewData } from "$lib/features/overview/overviewData";
  import { createLayout, isPluginWidget, PLUGIN_SIZES, SIZE_LABEL, SPAN, WIDGETS, type BuiltinWidgetId, type WidgetId } from "$lib/features/overview/layout.svelte";
  import OverviewWidget from "$lib/features/overview/OverviewWidget.svelte";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import PluginWidget from "$lib/features/plugins/PluginWidget.svelte";

  let data = $state<OverviewData | null>(null);
  let error = $state<string | null>(null);
  let editing = $state(false);
  const reorder = createReorder<WidgetId>("grid");

  const layout = createLayout(apiClient.getUser()?.id ?? "me");
  const defs = $derived(new Map([...WIDGETS, ...layout.extra].map((w) => [w.id, w])));
  // Plugin widgets whose plugin is gone or off stay in the saved layout but aren't shown.
  const shownSlots = $derived(layout.slots.filter((s) => defs.has(s.id)));

  // Widget plugins installed on your account (and switched on) can go on your own Overview.
  $effect(() => {
    if (!viewingClient.id && !plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
  });
  $effect(() => {
    const own = !viewingClient.id;
    layout.setExtra(
      own && plugins.communityOn
        ? plugins.installed
            .filter((p) => p.enabled && p.manifest.family === "widget")
            .map((p) => ({
              id: `plugin:${p.manifest.id}` as const,
              title: p.manifest.name,
              description: typeof p.manifest.description === "string" ? p.manifest.description : "Plugin",
              defaultSize: "m" as const,
              sizes: PLUGIN_SIZES,
            }))
        : [],
    );
  });
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  async function load(clientId: string | null) {
    data = null;
    error = null;
    try {
      data = await loadOverview(clientId ?? undefined);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your training.";
    }
  }

  $effect(() => {
    void load(viewingClient.id);
  });

  function onDrop(e: DragEvent) {
    const order = reorder.drop(e);
    if (order) layout.setOrder(order);
  }
</script>

<div class="flex flex-col gap-4">
  {#if editing}
    <div class="-mx-4 -mt-6 mb-1 flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground sm:-mx-8 sm:-mt-7 sm:px-8">
      <span class="text-sm font-semibold">Editing your Overview: drag or use the arrows to move, pick a size, or add widgets</span>
      <div class="flex gap-2">
        <button type="button" class="h-8 rounded-[9px] border border-primary-foreground/30 px-3 text-sm" onclick={() => layout.reset()}>Reset</button>
        <button type="button" class="h-8 rounded-[9px] bg-primary-foreground px-3.5 text-sm font-semibold text-primary" onclick={() => (editing = false)}>Done</button>
      </div>
    </div>
  {/if}

  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <p class="mb-1 text-[13px] text-muted-foreground">{today}</p>
      <h1 class="text-[26px] font-bold tracking-tight">This week</h1>
    </div>
    {#if !editing}
      <Button variant="outline" size="sm" onclick={() => (editing = true)}>Edit layout</Button>
    {/if}
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else}
    {#if editing}
      <section aria-label="Add a widget" class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-[15px] font-semibold">Add a widget</h2>
        {#if layout.hidden.length === 0}
          <p class="text-sm text-muted-foreground">Every widget is on your Overview. Widget plugins you install show up here too.</p>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each layout.hidden as w (w.id)}
              <button type="button" title={w.description} onclick={() => layout.add(w.id)}
                class="flex h-9 items-center gap-1.5 rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted">+ {w.title}</button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
    <div class="flex flex-wrap items-start gap-5">
      <div role="list" class="grid min-w-0 flex-[999_1_640px] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
        ondragenter={(e) => reorder.allow(e)} ondragover={(e) => reorder.allow(e)} ondrop={onDrop}>
        {#each reorder.arrange(shownSlots, (s) => s.id) as slot, i (slot.id)}
          {@const def = defs.get(slot.id)!}
          {@const isGap = reorder.held === slot.id}
          <section
            role="listitem"
            aria-label={def.title}
            animate:flip={{ duration: SLIDE_MS }}
            class="relative flex min-w-0 flex-col gap-3 rounded-[10px] px-[18px] py-4 {SPAN[slot.size]}
              {isGap ? 'border-[1.5px] border-dashed border-primary bg-primary/5 [&>*:not(.drop-label)]:invisible'
                : editing ? 'cursor-grab border-[1.5px] border-dashed border-primary/40 bg-card' : 'border border-border bg-card'}"
            draggable={editing}
            ondragstart={(e) => reorder.start(shownSlots.map((s) => s.id), slot.id, e)}
            ondragend={() => reorder.end()}
            ondragover={(e) => reorder.over(slot.id, e)}
          >
            {#if isGap}
              <span class="drop-label absolute inset-0 flex flex-col items-center justify-center text-[13px] text-primary"><span class="font-semibold">{def.title}</span>lands here</span>
            {/if}
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="min-w-0 truncate text-sm font-semibold">{def.title}</h2>
              {#if editing}
                <div class="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
                  <span class="flex gap-0.5 rounded-lg bg-muted p-0.5">
                    {#each def.sizes as size (size)}
                      <button type="button" aria-label="Size {SIZE_LABEL[size]}" aria-pressed={slot.size === size}
                        class="h-6 rounded-md px-2 text-[11px] {slot.size === size ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}"
                        onclick={() => layout.resize(slot.id, size)}>{SIZE_LABEL[size]}</button>
                    {/each}
                  </span>
                  <button type="button" aria-label="Move earlier" disabled={i === 0} class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30" onclick={() => layout.move(slot.id, -1)}><ArrowLeft class="size-3.5" /></button>
                  <button type="button" aria-label="Move later" disabled={i === shownSlots.length - 1} class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30" onclick={() => layout.move(slot.id, 1)}><ArrowRight class="size-3.5" /></button>
                  <button type="button" aria-label="Remove {def.title}" class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive" onclick={() => layout.remove(slot.id)}><X class="size-3.5" /></button>
                </div>
              {/if}
            </div>
            {#if isPluginWidget(slot.id)}
              {@const plugin = plugins.get(slot.id.slice("plugin:".length))}
              {#if plugin}<PluginWidget {plugin} />{/if}
            {:else if data}
              <OverviewWidget id={slot.id as BuiltinWidgetId} {data} />
            {:else}
              <Skeleton class="h-14" />
            {/if}
          </section>
        {/each}
      </div>

    </div>
  {/if}
</div>
