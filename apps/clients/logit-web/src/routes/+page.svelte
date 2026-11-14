<script lang="ts">
  import { apiClient } from "@logit/core/api/client";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import X from "@lucide/svelte/icons/x";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { loadOverview, type OverviewData } from "$lib/features/overview/overviewData";
  import { createLayout, SIZE_LABEL, SPAN, WIDGETS, type WidgetId } from "$lib/features/overview/layout.svelte";
  import OverviewWidget from "$lib/features/overview/OverviewWidget.svelte";

  let data = $state<OverviewData | null>(null);
  let error = $state<string | null>(null);
  let editing = $state(false);
  let dragging = $state<WidgetId | null>(null);

  const layout = createLayout(apiClient.getUser()?.id ?? "me");
  const defs = new Map(WIDGETS.map((w) => [w.id, w]));
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

  function onDrop(target: WidgetId) {
    if (dragging) layout.moveTo(dragging, target);
    dragging = null;
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
          <p class="text-sm text-muted-foreground">Every widget is on your Overview. Insights and plugin widgets join this list in later updates.</p>
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
      <div class="grid min-w-0 flex-[999_1_640px] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {#each layout.slots as slot, i (slot.id)}
          {@const def = defs.get(slot.id)!}
          <section
            aria-label={def.title}
            class="flex min-w-0 flex-col gap-3 rounded-[10px] bg-card px-[18px] py-4 {SPAN[slot.size]}
              {editing ? 'cursor-grab border-[1.5px] border-dashed border-primary/40' : 'border border-border'}
              {dragging === slot.id ? 'opacity-50' : ''}"
            draggable={editing}
            ondragstart={() => (dragging = slot.id)}
            ondragend={() => (dragging = null)}
            ondragover={(e) => { if (editing) e.preventDefault(); }}
            ondrop={(e) => { e.preventDefault(); onDrop(slot.id); }}
          >
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
                  <button type="button" aria-label="Move later" disabled={i === layout.slots.length - 1} class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30" onclick={() => layout.move(slot.id, 1)}><ArrowRight class="size-3.5" /></button>
                  <button type="button" aria-label="Remove {def.title}" class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive" onclick={() => layout.remove(slot.id)}><X class="size-3.5" /></button>
                </div>
              {/if}
            </div>
            {#if data}
              <OverviewWidget id={slot.id} {data} />
            {:else}
              <Skeleton class="h-14" />
            {/if}
          </section>
        {/each}
      </div>

    </div>
  {/if}
</div>
