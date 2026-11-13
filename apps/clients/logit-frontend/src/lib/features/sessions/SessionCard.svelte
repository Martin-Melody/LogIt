<script lang="ts">
  import { ChevronRight, Trophy, TrendingUp, TrendingDown } from "lucide-svelte";
  import type { WeightUnit } from "@logit/core/domain/units";
  import { blockDisplayName, type SessionBlock, type StrengthBlockData, type MobilityBlockData } from "@logit/core/domain/workout";
  import { sessionMatches } from "@logit/core/domain/sessionHistory";
  import type { HistoryEntry } from "./history";
  import { changeClass, changeLabel, dayLabel, durationLabel, setsSummary, timeLabel, volumeLabel } from "./format";

  // One day's workouts: the first as a full card, any more that day as rows under it.
  const {
    entries,
    unit,
    query = "",
    onOpen,
  }: {
    entries: HistoryEntry[];
    unit: WeightUnit;
    query?: string;
    onOpen: (entry: HistoryEntry) => void;
  } = $props();

  const main = $derived(entries[0]!);
  const more = $derived(entries.slice(1));

  function names(e: HistoryEntry): string {
    const all = [...e.session.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map(blockDisplayName);
    return all.length > 3 ? `${all.slice(0, 3).join(" · ")} +${all.length - 3}` : all.join(" · ");
  }

  function itemWord(e: HistoryEntry): string {
    const allMobility = e.session.blocks.length > 0 && e.session.blocks.every((b) => b.type === "mobility");
    const w = allMobility ? "drill" : "exercise";
    return `${e.itemCount} ${w}${e.itemCount === 1 ? "" : "s"}`;
  }

  function stats(e: HistoryEntry): string {
    const parts = [itemWord(e)];
    if (e.setCount) parts.push(`${e.setCount} set${e.setCount === 1 ? "" : "s"}`);
    if (e.volumeKg > 0) parts.push(volumeLabel(e.volumeKg, unit));
    return parts.join(" · ");
  }

  function when(e: HistoryEntry): string {
    const s = e.session;
    if (e.inProgress) return `In progress · started ${timeLabel(s.startedAtMs)}`;
    const parts = [dayLabel(s.startedAtMs), timeLabel(s.startedAtMs)];
    if (s.endedAtMs) parts.push(durationLabel(s.endedAtMs - s.startedAtMs));
    if (e.parentName) parts.push(e.parentName);
    return parts.join(" · ");
  }

  function sameDay(e: HistoryEntry): string {
    const s = e.session;
    const parts = ["Same day", timeLabel(s.startedAtMs)];
    if (s.endedAtMs) parts.push(durationLabel(s.endedAtMs - s.startedAtMs));
    parts.push(itemWord(e));
    return parts.join(" · ");
  }

  /** The matching exercise's sets, for search results. */
  function matchSummary(e: HistoryEntry, b: SessionBlock): string {
    if (b.type === "strength") {
      const sets = (b.data as StrengthBlockData).sets.filter((s) => s.setType !== "warmup" && (s.reps > 0 || s.completed));
      return setsSummary(sets, unit);
    }
    if (b.type === "mobility") {
      const d = b.data as MobilityBlockData;
      const vals = d.sets.map((s) => (d.metric === "hold" ? s.durationSec : s.reps) ?? 0).filter((v) => v > 0);
      return vals.length ? `${vals.length} × ${Math.max(...vals)}${d.metric === "hold" ? " s" : ""}` : "–";
    }
    return "";
  }

  function highlight(name: string, q: string): { before: string; hit: string; after: string } {
    const i = name.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0 || !q.trim()) return { before: name, hit: "", after: "" };
    const n = q.trim().length;
    return { before: name.slice(0, i), hit: name.slice(i, i + n), after: name.slice(i + n) };
  }

  const matches = $derived(query.trim() ? sessionMatches(main.session, query) : []);
</script>

{#snippet summary(e: HistoryEntry)}
  {@const c = e.comparison}
  {#if c && c.up > 0}
    <span class="flex shrink-0 items-center gap-1 font-medium text-success">
      <TrendingUp class="h-3.5 w-3.5" /> Up on {c.up} of {c.compared}
    </span>
  {:else if c && c.down > 0}
    <span class="flex shrink-0 items-center gap-1 font-medium text-warning">
      <TrendingDown class="h-3.5 w-3.5" /> Down on {c.down} of {c.compared}
    </span>
  {:else if c && c.compared > 0}
    <span class="shrink-0 text-muted-foreground">Same as last time</span>
  {/if}
{/snippet}

<div class="overflow-hidden rounded-xl border bg-card {main.inProgress ? 'border-primary/40' : ''}">
  <button
    type="button"
    class="flex w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
    onclick={() => onOpen(main)}
  >
    <div class="flex w-full items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-semibold">{main.title}</p>
        <p class="truncate text-xs {main.inProgress ? 'font-medium text-primary' : 'text-muted-foreground'}">{when(main)}</p>
      </div>
      {#if main.inProgress}
        <span class="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Resume</span>
      {:else if main.prs.length}
        <span class="flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-highlight-fill/50 bg-highlight-fill/15 px-1.5 text-[11px] font-semibold text-highlight">
          <Trophy class="h-3 w-3" />
          {main.prs.length} PR{main.prs.length === 1 ? "" : "s"}
        </span>
      {/if}
    </div>

    {#if matches.length}
      {#each matches as b (b.id)}
        {@const h = highlight(blockDisplayName(b), query)}
        {@const change = main.comparison?.byBlockId[b.id]}
        <div class="flex w-full items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-[13px]">
          <span class="min-w-0 flex-1 truncate font-semibold">{h.before}<mark class="rounded-sm bg-highlight-fill/40 px-px text-foreground">{h.hit}</mark>{h.after}</span>
          <span class="shrink-0 tabular-nums">{matchSummary(main, b)}</span>
          {#if change && change.kind !== "new"}
            <span class="shrink-0 rounded px-1 text-[11px] font-semibold {changeClass(change.kind)}">{changeLabel(change, unit, b.type === "mobility" ? (b.data as MobilityBlockData).metric : null)}</span>
          {/if}
        </div>
      {/each}
    {:else if main.session.blocks.length}
      <p class="w-full truncate text-[13px]">{names(main)}</p>
      <div class="flex w-full items-center gap-2 text-xs">
        <span class="min-w-0 flex-1 truncate text-muted-foreground">{stats(main)}</span>
        {#if !main.inProgress}{@render summary(main)}{/if}
      </div>
    {:else}
      <p class="text-[13px] text-muted-foreground">Nothing logged</p>
    {/if}
  </button>

  {#each more as e (e.session.id)}
    <button
      type="button"
      class="flex w-full items-center gap-2.5 border-t border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      onclick={() => onOpen(e)}
    >
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold">{e.title}</span>
        <span class="block truncate text-xs text-muted-foreground">{sameDay(e)}</span>
      </span>
      {#if e.prs.length}
        <Trophy class="h-3.5 w-3.5 shrink-0 text-highlight" aria-label="{e.prs.length} PRs" />
      {/if}
      <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  {/each}
</div>
