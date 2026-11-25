<!-- A board (design canvas G4, B2): place, person (green dot when training), done of planned
     (green when all done, "Rest week" for a paused week), weeks kept, volume against their own
     usual. Your row is highlighted. No medals, points or levels. -->
<script lang="ts">
  import { allDone, boardPlaces, volumeText, type BoardRow } from "@logit/core/api/boardsApi";
  import PersonAvatar from "./PersonAvatar.svelte";

  const { rows, training = new Set<string>(), compact = false, label = "Member" }: {
    rows: BoardRow[];
    training?: Set<string>;
    /** The group page's three-row summary: no column heads, no volume. */
    compact?: boolean;
    label?: string;
  } = $props();
  const places = $derived(boardPlaces(rows));
  const cols = $derived(compact ? "grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3rem]" : "grid-cols-[1.75rem_minmax(0,1fr)_4.4rem_3rem_3.5rem]");
</script>

<div role="table" aria-label="This week's board" class="tabular-nums">
  {#if !compact}
    <div role="row" class="grid {cols} gap-1.5 border-b border-border px-4 py-1.5 text-[12px] text-muted-foreground">
      <span role="columnheader">#</span><span role="columnheader">{label}</span><span role="columnheader" class="text-right">Done</span><span role="columnheader" class="text-right">Weeks</span><span role="columnheader" class="text-right">Volume</span>
    </div>
  {/if}
  {#each rows as r, i (r.user.id)}
    <div role="row" aria-current={r.me ? "true" : undefined} class="grid {cols} min-h-13 items-center gap-1.5 border-b border-border px-4 last:border-b-0 {r.me ? 'bg-muted' : ''}">
      <span role="cell" class="text-[13px] text-muted-foreground">{places[i] ?? "–"}</span>
      <a role="cell" href={r.me ? "/profile" : `/social/${r.user.username}`} class="flex min-w-0 items-center gap-2 text-inherit no-underline">
        {#if !compact}<PersonAvatar name={r.user.displayName} src={r.user.avatarUrl} size={30} training={training.has(r.user.username)} />{/if}
        <span class="truncate text-[15px] {r.me ? 'font-semibold' : 'font-medium'}">{r.me ? "You" : r.user.displayName || r.user.username}</span>
      </a>
      {#if r.rest}
        <span role="cell" class="text-right text-[13px] text-muted-foreground">Rest week</span>
      {:else}
        <span role="cell" class="text-right text-[15px] font-semibold {allDone(r) ? 'text-success' : ''}">{r.done}/{r.planned}</span>
      {/if}
      <span role="cell" class="text-right {compact ? 'text-[13px] text-muted-foreground' : 'text-[15px] font-semibold'}">{compact ? `${r.weeksKept} wk` : r.weeksKept}</span>
      {#if !compact}<span role="cell" class="text-right text-[14px] text-muted-foreground">{volumeText(r.volumePct)}</span>{/if}
    </div>
  {/each}
</div>
