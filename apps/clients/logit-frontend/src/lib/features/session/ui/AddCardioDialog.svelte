<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import type { CardioActivity, CardioMeasure } from "@logit/core/domain/cardioActivity";
  import type { CardioBlockData } from "@logit/core/domain/workout";
  import { CARDIO_MEASURE_LABEL, newCardioActivity, sourceLabel, type LibraryEntry } from "@logit/core/domain/library";
  import { loadLibrary, saveOwnItem } from "$lib/data/library/library";
  import { getWorkoutRepo } from "$lib/data/repoProvider";

  const props = $props<{
    open?: boolean;
    saving?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (name: string) => void | Promise<void>;
    title?: string;
    submitLabel?: string;
  }>();

  const saving = $derived(props.saving ?? false);
  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSubmit = props.onSubmit ?? ((_n: string) => {});

  let name = $state("");
  let measures = $state<CardioMeasure>("time-distance");
  let entries = $state<LibraryEntry[]>([]);
  let recentNames = $state<string[]>([]);

  $effect(() => {
    if (props.open) {
      void loadLibrary("cardio").then((e) => (entries = e));
      void loadRecent();
    } else {
      name = "";
      measures = "time-distance";
    }
  });

  /** The last few activities you logged, newest first. */
  async function loadRecent() {
    try {
      const sessions = await getWorkoutRepo().listRecentSessions({ limit: 30 });
      const seen = new Set<string>();
      const out: string[] = [];
      for (const s of sessions) {
        for (const b of s.blocks) {
          if (b.type !== "cardio") continue;
          const n = (b.data as CardioBlockData).activityName?.trim();
          if (n && !seen.has(n.toLowerCase())) {
            seen.add(n.toLowerCase());
            out.push(n);
          }
        }
      }
      recentNames = out.slice(0, 3);
    } catch {
      recentNames = [];
    }
  }

  const q = $derived(name.trim().toLowerCase());
  const exact = $derived(entries.find((e) => e.item.name.toLowerCase() === q));
  const matches = $derived(q ? entries.filter((e) => e.item.name.toLowerCase().includes(q)) : entries);
  const recent = $derived(
    q ? [] : recentNames.map((n) => entries.find((e) => e.item.name.toLowerCase() === n.toLowerCase()) ?? n),
  );

  function details(e: LibraryEntry): string {
    const label = CARDIO_MEASURE_LABEL[(e.item as CardioActivity).measures];
    return e.source === "logit" ? label : `${sourceLabel(e)} · ${label}`;
  }

  async function choose(activityName: string) {
    await onSubmit(activityName);
    onOpenChange(false);
  }

  async function addNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (exact) return choose(exact.item.name);
    await saveOwnItem({ kind: "cardio", item: newCardioActivity({ name: trimmed, measures }) });
    await choose(trimmed);
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{props.title ?? "Add cardio"}</Dialog.Title>
      <Dialog.Description>Pick one, or type a new one. New ones are saved to your library.</Dialog.Description>
    </Dialog.Header>

    <input
      class="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      placeholder="Search cardio"
      aria-label="Search cardio"
      bind:value={name}
      disabled={saving}
      onkeydown={(e) => { if (e.key === "Enter") void addNew(); }}
    />

    <div class="-mx-1 max-h-[45vh] overflow-y-auto">
      {#if recent.length > 0}
        <p class="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
        {#each recent as r (typeof r === "string" ? r : r.item.id)}
          <button type="button" class="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-muted" onclick={() => void choose(typeof r === "string" ? r : r.item.name)}>
            <span>{typeof r === "string" ? r : r.item.name}</span>
            {#if typeof r !== "string"}<span class="text-[11px] text-muted-foreground">{details(r)}</span>{/if}
          </button>
        {/each}
        <p class="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">All</p>
      {/if}
      {#each matches as e (e.item.id)}
        <button type="button" class="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-muted" onclick={() => void choose(e.item.name)}>
          <span>{e.item.name}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{details(e)}</span>
        </button>
      {/each}
      {#if q && matches.length === 0}
        <p class="px-2 py-2 text-sm text-muted-foreground">Nothing called that yet.</p>
      {/if}
    </div>

    {#if q && !exact}
      <div class="flex flex-col gap-2 rounded-md bg-muted/60 p-3">
        <p class="text-sm font-medium">New: “{name.trim()}”</p>
        <div class={segmentTrack}>
          <button type="button" class={segment(measures === "time-distance")} aria-pressed={measures === "time-distance"} onclick={() => (measures = "time-distance")}>Time and distance</button>
          <button type="button" class={segment(measures === "time")} aria-pressed={measures === "time"} onclick={() => (measures = "time")}>Time</button>
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
      <Button disabled={!q || saving} onclick={() => void addNew()}>
        {exact ? `Add ${exact.item.name}` : q ? `Add ${name.trim()}` : (props.submitLabel ?? "Add")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
