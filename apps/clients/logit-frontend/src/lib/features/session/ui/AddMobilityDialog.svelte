<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Timer, Hash, Check } from "lucide-svelte";
  import { reveal } from "$lib/transitions";
  import type { MobilityMetric } from "@logit/core/domain/workout";
  import type { MobilityArea, MobilityDrill } from "@logit/core/domain/mobilityDrill";
  import { MOBILITY_AREAS } from "@logit/core/domain/mobilityDrill";
  import { MOBILITY_AREA_LABEL, newMobilityDrill, sourceLabel, type LibraryEntry } from "@logit/core/domain/library";
  import { loadLibrary, saveOwnItem } from "$lib/data/library/library";

  const props = $props<{
    open?: boolean;
    saving?: boolean;
    /** "swap" hides the metric / per-side options — a swap keeps the logged sets. */
    mode?: "add" | "swap";
    title?: string;
    description?: string;
    submitLabel?: string;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (drill: {
      drillName: string;
      drillId?: string;
      metric: MobilityMetric;
      perSide: boolean;
    }) => void | Promise<void>;
  }>();

  const saving = $derived(props.saving ?? false);
  const mode = $derived(props.mode ?? "add");
  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSubmit = props.onSubmit ?? (() => {});

  let name = $state("");
  let metric = $state<MobilityMetric>("hold");
  let perSide = $state(false);
  let touchedMetric = $state(false);
  let touchedPerSide = $state(false);
  let entries = $state<LibraryEntry[]>([]);
  const catalog = $derived(entries.map((e) => e.item as MobilityDrill));
  let area = $state<MobilityArea>("full-body");
  let inputEl = $state<HTMLInputElement | null>(null);
  let listOpen = $state(false);
  let activeIndex = $state(-1);

  $effect(() => {
    if (props.open) {
      void loadLibrary("mobility").then((c) => (entries = c));
      queueMicrotask(() => inputEl?.focus());
    } else {
      name = "";
      metric = "hold";
      perSide = false;
      area = "full-body";
      touchedMetric = false;
      touchedPerSide = false;
      listOpen = false;
      activeIndex = -1;
    }
  });

  // When the typed name matches a catalog drill, adopt its defaults unless the
  // user has overridden them.
  const matched = $derived(
    catalog.find((d) => d.name.toLowerCase() === name.trim().toLowerCase()),
  );
  $effect(() => {
    if (!matched) return;
    if (!touchedMetric) metric = matched.defaultMetric;
    if (!touchedPerSide) perSide = matched.perSide;
  });

  const results = $derived.by(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 1) {
      // Swap is a deliberate "find a replacement" search — don't presume a
      // browse list before the user's typed anything, unlike Add, where
      // browsing the catalog cold is the whole point of showing it.
      return mode === "swap" ? [] : catalog.slice(0, 8);
    }
    return catalog.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8);
  });
  const showAddNew = $derived(
    name.trim().length > 0 && !catalog.some((d) => d.name.toLowerCase() === name.trim().toLowerCase()),
  );

  function pick(d: MobilityDrill) {
    name = d.name;
    listOpen = false;
    activeIndex = -1;
  }

  function onKeydown(e: KeyboardEvent) {
    const total = results.length + (showAddNew ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      listOpen = true;
      activeIndex = Math.min(activeIndex + 1, total - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) pick(results[activeIndex]!);
      else void handleConfirm();
    } else if (e.key === "Escape") {
      listOpen = false;
    }
  }

  function tag(d: MobilityDrill): string | null {
    const e = entries.find((x) => x.item.id === d.id);
    return e && e.source !== "logit" ? sourceLabel(e) : null;
  }

  async function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    let drillId = matched?.id;
    // A drill that isn't in the library yet is saved to it, so it's there next time.
    if (!matched) {
      const saved = await saveOwnItem({ kind: "mobility", item: newMobilityDrill({ name: trimmed, area, defaultMetric: metric, perSide }) });
      drillId = saved.item.id;
    }
    await onSubmit({ drillName: trimmed, drillId, metric, perSide });
    onOpenChange(false);
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{props.title ?? "Add mobility drill"}</Dialog.Title>
      <Dialog.Description>
        {props.description ??
          "A stretch or mobility drill — held for time, or done for reps."}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 py-1">
      <div class="relative">
        <input
          bind:this={inputEl}
          class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search drills, or type a new one…"
          bind:value={name}
          oninput={() => { listOpen = true; activeIndex = -1; }}
          onfocus={() => (listOpen = true)}
          onblur={() => setTimeout(() => (listOpen = false), 150)}
          onkeydown={onKeydown}
        />

        {#if listOpen && (results.length > 0 || showAddNew)}
          <ul
            class="absolute z-50 w-full mt-1 rounded-lg border border-border bg-background shadow-lg overflow-hidden max-h-60 overflow-y-auto"
            transition:reveal
          >
            {#each results as d, i (d.id)}
              <li>
                <button
                  type="button"
                  class="w-full px-3 py-2 text-left text-sm transition-colors {activeIndex === i ? 'bg-muted' : 'hover:bg-muted'}"
                  onpointerdown={(e) => { e.preventDefault(); pick(d); }}
                >
                  <span class="flex items-baseline justify-between gap-2">
                    <span>{d.name}</span>
                    {#if tag(d)}<span class="shrink-0 text-[11px] text-muted-foreground">{tag(d)}</span>{/if}
                  </span>
                  {#if d.cues?.length}
                    <span class="block text-xs text-muted-foreground truncate">{d.cues[0]}</span>
                  {/if}
                </button>
              </li>
            {/each}
            {#if showAddNew}
              <li>
                <button
                  type="button"
                  class="w-full px-3 py-2 text-left text-sm text-muted-foreground transition-colors {activeIndex === results.length ? 'bg-muted' : 'hover:bg-muted'}"
                  onpointerdown={(e) => { e.preventDefault(); void handleConfirm(); }}
                >
                  New: “<span class="text-foreground font-medium">{name.trim()}</span>”, saved to your library
                </button>
              </li>
            {/if}
          </ul>
        {/if}
      </div>

      {#if matched?.cues?.length}
        <p class="text-xs text-muted-foreground" transition:reveal>
          {matched.cues.join(" · ")}
        </p>
      {/if}

      {#if showAddNew}
        <div class="flex flex-col gap-1.5" transition:reveal>
          <p class="text-xs text-muted-foreground">“{name.trim()}” is new, so it's saved to your library.</p>
          <label class="sr-only" for="new-drill-area">Body area</label>
          <select id="new-drill-area" class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" bind:value={area}>
            {#each MOBILITY_AREAS as a (a)}<option value={a}>Area: {MOBILITY_AREA_LABEL[a]}</option>{/each}
          </select>
        </div>
      {/if}

      {#if mode !== "swap"}
        <!-- Metric -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm {metric === 'hold' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}"
            onclick={() => { metric = "hold"; touchedMetric = true; }}
          >
            <Timer class="h-3.5 w-3.5" /> Hold (time)
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm {metric === 'reps' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}"
            onclick={() => { metric = "reps"; touchedMetric = true; }}
          >
            <Hash class="h-3.5 w-3.5" /> Reps
          </button>
        </div>

        <!-- Per side -->
        <button
          type="button"
          class="flex items-center justify-between rounded-md border px-3 py-2 text-sm {perSide ? 'border-primary bg-primary/10' : 'border-border'}"
          onclick={() => { perSide = !perSide; touchedPerSide = true; }}
        >
          <span class="text-left">
            <span class="block font-medium text-foreground">Track each side</span>
            <span class="block text-xs text-muted-foreground">Log left and right separately, e.g. rehab work.</span>
          </span>
          <span class="ml-2 flex h-5 w-5 items-center justify-center rounded-md border {perSide ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}">
            {#if perSide}<Check class="h-3.5 w-3.5" />{/if}
          </span>
        </button>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
      <Button disabled={!name.trim() || saving} onclick={() => void handleConfirm()}>
        {props.submitLabel ?? "Add"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
