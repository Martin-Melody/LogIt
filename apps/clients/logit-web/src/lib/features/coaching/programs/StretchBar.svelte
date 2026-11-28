<!-- The program's weeks as one bar of stretches (canvas PW2), each as wide as its weeks with the
     week numbers inside. Click one to change it; drag the edge between two (or focus it and use
     the arrow keys) to move where one ends and the next starts. -->
<script lang="ts" module>
  import type { Stretch as S } from "@logit/core/domain/stretches";
  /** A stretch's colours: finding weights blue, lighter weeks amber, tests green. */
  export function tone(s: Pick<S, "what" | "plain">): string {
    const w = s.what;
    if (s.plain) return "border-border bg-background";
    if (w.kind === "find" || (w.kind === "pack" && w.findsWeights)) return "border-info/50 bg-info/10 text-info";
    if (w.kind === "week" && w.type.kind === "test") return "border-success/50 bg-success/10 text-success";
    if (w.kind === "week" && (w.type.kind === "deload" || w.type.kind === "intro")) return "border-warning/50 bg-warning/10 text-warning";
    return "border-foreground/25 bg-muted";
  }
</script>

<script lang="ts">
  import { stretchTitle, stretchWhatText, type Stretch } from "@logit/core/domain/stretches";
  import type { ProgramRule } from "@logit/core/domain/CoachProgram";

  let { stretches, total, rule, onopen, onedge, preview = false }: {
    stretches: Stretch[];
    total: number;
    rule: ProgramRule | undefined;
    onopen: (s: Stretch) => void;
    /** The boundary after stretch i moves so the next starts at week `start`. */
    onedge: (i: number, start: number) => void;
    /** Just shows them (the new-program setup): no clicking or dragging. */
    preview?: boolean;
  } = $props();

  let bar = $state<HTMLDivElement | null>(null);
  let dragging = $state<{ i: number; start: number } | null>(null);
  function weekAt(clientX: number): number {
    const r = bar!.getBoundingClientRect();
    return Math.round(((clientX - r.left) / r.width) * total) + 1;
  }
  function clampStart(i: number, start: number): number {
    // The edge can't pass the start of stretch i or the end of stretch i+1.
    return Math.max(stretches[i]!.from + 1, Math.min(stretches[i + 1]!.to, start));
  }
  const shown = $derived(dragging ? stretches.map((s, k) => (k === dragging!.i ? { ...s, to: dragging!.start - 1 } : k === dragging!.i + 1 ? { ...s, from: dragging!.start } : s)) : stretches);
</script>

<div bind:this={bar} class="flex w-full min-w-0 gap-1" role="list" aria-label="Weeks">
  {#each shown as s, i (s.key + ":" + i)}
    <div role="listitem" class="relative flex min-w-0" style="flex: {s.to - s.from + 1} 1 0%">
      <button type="button" disabled={preview} onclick={() => onopen(stretches[i]!)} title="{stretchTitle(s)} · {stretchWhatText(s, rule)}"
        class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[9px] border px-2.5 py-1.5 text-left transition-[background-color,flex-grow] duration-150 enabled:hover:brightness-110 disabled:cursor-default {tone(s)}">
        <span class="truncate text-xs font-semibold {s.plain ? 'text-muted-foreground' : ''}">{stretchTitle(s)}</span>
        <span class="truncate text-[11px] text-muted-foreground">{stretchWhatText(s, rule)}</span>
        <span class="flex">{#each Array.from({ length: s.to - s.from + 1 }, (_, k) => s.from + k) as n (n)}<span class="flex-1 text-center text-[11px] font-medium tabular-nums text-muted-foreground">{n}</span>{/each}</span>
      </button>
      {#if i < shown.length - 1 && !preview}
        <button type="button" aria-label="Where {stretchTitle(stretches[i]!)} ends (arrow keys)" title="Drag to change the weeks"
          class="absolute -right-[5px] top-1 bottom-1 z-10 w-[6px] cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-primary focus:bg-primary focus:outline-none {dragging?.i === i ? 'bg-primary' : ''}"
          onpointerdown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragging = { i, start: stretches[i + 1]!.from }; }}
          onpointermove={(e) => { if (dragging?.i === i) dragging = { i, start: clampStart(i, weekAt(e.clientX)) }; }}
          onpointerup={() => { if (dragging?.i === i) { const st = dragging.start; dragging = null; if (st !== stretches[i + 1]!.from) onedge(i, st); } }}
          onpointercancel={() => (dragging = null)}
          onkeydown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); const st = clampStart(i, stretches[i + 1]!.from + (e.key === "ArrowLeft" ? -1 : 1)); if (st !== stretches[i + 1]!.from) onedge(i, st); }}
        ></button>
      {/if}
    </div>
  {/each}
</div>
