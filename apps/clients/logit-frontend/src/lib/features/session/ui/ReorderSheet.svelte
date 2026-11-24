<script lang="ts">
  import { Check, ChevronDown, ChevronUp, GripVertical, Link2, Repeat } from "lucide-svelte";
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import type { SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import { blockDisplayName, groupKindOf } from "@logit/core/domain/workout";
  import { blockProgress, blockStages } from "$lib/features/session/stage";
  import { motionOK } from "$lib/transitions";
  import { onBack } from "$lib/components/sheet/sheet";

  // Reorder mode (design canvas V2-reorder, drawn in the app's rows): every exercise as one
  // line with a handle; a superset or circuit moves as one. Drag a handle, or use ↑ ↓ (for
  // anyone who can't drag). Each move is a step, so Undo works here too.
  const {
    session,
    onClose,
    onMutate,
  }: {
    session: WorkoutSession;
    onClose: () => void;
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession) => Promise<void>;
  } = $props();

  $effect(() => onBack(onClose));

  type Unit = { key: string; blocks: SessionBlock[] };
  function unitsOf(s: WorkoutSession): Unit[] {
    const sorted = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const out: Unit[] = [];
    for (const b of sorted) {
      const gid = (b.data as { superset?: { id: string } }).superset?.id;
      const last = out.at(-1);
      const lastGid = last ? (last.blocks[0]!.data as { superset?: { id: string } }).superset?.id : undefined;
      if (last && gid && gid === lastGid) last.blocks.push(b);
      else out.push({ key: gid ? `g:${gid}` : b.id, blocks: [b] });
    }
    return out;
  }
  const units = $derived(unitsOf(session));
  const stages = $derived(blockStages(session));

  /** The workout with unit `from` moved to position `to`. */
  function moved(s: WorkoutSession, key: string, to: number): WorkoutSession {
    const list = unitsOf(s);
    const from = list.findIndex((u) => u.key === key);
    if (from === -1 || to === from || to < 0 || to >= list.length) return s;
    const [u] = list.splice(from, 1);
    list.splice(to, 0, u!);
    const order = new Map(list.flatMap((x) => x.blocks).map((b, i) => [b.id, i]));
    return { ...s, blocks: s.blocks.map((b) => ({ ...b, orderIndex: order.get(b.id) ?? b.orderIndex })) };
  }
  function move(key: string, to: number) {
    void onMutate((s) => moved(s, key, to));
  }

  // Dragging: the row follows the finger; it drops where it's let go.
  let listEl = $state<HTMLElement | null>(null);
  let drag = $state<{ key: string; startY: number; dy: number } | null>(null);
  function rowHeight(): number {
    const rows = listEl?.querySelectorAll("[data-unit]");
    if (!rows?.length) return 64;
    return listEl!.getBoundingClientRect().height / rows.length;
  }
  function onDown(e: PointerEvent, key: string) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { key, startY: e.clientY, dy: 0 };
  }
  function onMoveP(e: PointerEvent) {
    if (drag) drag.dy = e.clientY - drag.startY;
  }
  function onUp() {
    if (!drag) return;
    const from = units.findIndex((u) => u.key === drag!.key);
    const to = Math.max(0, Math.min(units.length - 1, from + Math.round(drag.dy / rowHeight())));
    const key = drag.key;
    drag = null;
    if (to !== from) move(key, to);
  }

  function meta(u: Unit): string {
    const p = u.blocks.map(blockProgress).reduce((a, x) => ({ total: a.total + x.total, done: a.done + x.done }), { total: 0, done: 0 });
    const stage = stages.get(u.blocks[0]!.id);
    if (stage === "done") return `Done · ${p.total} set${p.total === 1 ? "" : "s"}`;
    if (stage === "current") return `Now · ${p.done} of ${p.total}`;
    return `${p.total} set${p.total === 1 ? "" : "s"}`;
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]"
  transition:fly={{ y: 24, duration: motionOK() ? 200 : 0 }} role="dialog" aria-label="Reorder the workout">
  <header class="page-header">
    <div class="flex min-w-0 flex-1 flex-col">
      <h1 class="text-base font-semibold leading-tight">Reorder</h1>
      <span class="truncate text-xs text-muted-foreground">Drag a handle. A superset moves as one.</span>
    </div>
    <button type="button" class="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground" onclick={onClose}>Done</button>
  </header>

  <ul class="flex-1 overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]" bind:this={listEl}>
    {#each units as u, i (u.key)}
      {@const group = u.blocks.length > 1 || u.key.startsWith("g:")}
      {@const stage = stages.get(u.blocks[0]!.id)}
      {@const dragging = drag?.key === u.key}
      <li data-unit animate:flip={{ duration: motionOK() ? 180 : 0 }}
        class="relative border-b border-border/60 bg-background {dragging ? 'z-10 rounded-lg shadow-lg ring-1 ring-input' : ''}"
        style={dragging ? `transform: translateY(${drag!.dy}px)` : ""}>
        <div class="flex min-h-[58px] items-center pr-1">
          <button type="button" class="flex h-14 w-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing touch-none"
            style="touch-action: none" aria-label="Drag {u.blocks.map((b) => blockDisplayName(b)).join(' and ')}"
            onpointerdown={(e) => onDown(e, u.key)} onpointermove={onMoveP} onpointerup={onUp} onpointercancel={onUp}>
            <GripVertical class="h-4 w-4" />
          </button>
          {#if stage === "done"}
            <span class="mr-2.5 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check class="h-3.5 w-3.5" strokeWidth={3} /></span>
          {:else if group}
            <span class="mr-2.5 flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-muted">
              {#if groupKindOf(u.blocks.length, (u.blocks[0]!.data as { superset?: { kind?: "superset" | "circuit" } }).superset?.kind) === "circuit"}<Repeat class="h-3.5 w-3.5" />{:else}<Link2 class="h-3.5 w-3.5" />{/if}
            </span>
          {/if}
          <span class="flex min-w-0 flex-1 flex-col py-1.5">
            <span class="truncate text-[15px] font-medium">{u.blocks.map((b) => blockDisplayName(b)).join(" + ")}</span>
            <span class="truncate text-xs text-muted-foreground tabular-nums">{group ? `${u.blocks.length} exercises · ` : ""}{meta(u)}</span>
          </span>
          <button type="button" class="flex size-11 items-center justify-center rounded-md text-muted-foreground disabled:opacity-30" aria-label="Move up" disabled={i === 0} onclick={() => move(u.key, i - 1)}>
            <ChevronUp class="h-4 w-4" />
          </button>
          <button type="button" class="flex size-11 items-center justify-center rounded-md text-muted-foreground disabled:opacity-30" aria-label="Move down" disabled={i === units.length - 1} onclick={() => move(u.key, i + 1)}>
            <ChevronDown class="h-4 w-4" />
          </button>
        </div>
      </li>
    {/each}
  </ul>
</div>
