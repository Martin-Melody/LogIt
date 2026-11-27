<!-- One card while editing (canvas W13): its tools above it; dragging it onto another moves it. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import XIcon from "@lucide/svelte/icons/x";

  let { editing, name, fixed = false, first, last, onmove, onremove, ondragstart, ondragover, children }: {
    editing: boolean; name: string; fixed?: boolean; first: boolean; last: boolean;
    onmove: (by: -1 | 1) => void; onremove: () => void; ondragstart: () => void; ondragover: () => void; children: Snippet;
  } = $props();
</script>

{#if editing}
  <div class="flex flex-col gap-1.5 rounded-[12px] outline-2 outline-offset-2 outline-dashed outline-border transition-[outline-color] hover:outline-primary/40"
    role="listitem" draggable={!fixed} ondragstart={ondragstart} ondragover={(e) => { e.preventDefault(); ondragover(); }}>
    <div class="flex items-center gap-1 text-xs text-muted-foreground">
      {#if !fixed}<GripVerticalIcon class="size-3.5 cursor-grab" aria-hidden="true" />{/if}
      <span class="flex-1 font-medium">{name}{fixed ? " · always first" : ""}</span>
      {#if !fixed}
        <Button variant="ghost" size="icon" class="size-6" aria-label="Move {name} up" disabled={first} onclick={() => onmove(-1)}><ArrowUpIcon class="size-3.5" /></Button>
        <Button variant="ghost" size="icon" class="size-6" aria-label="Move {name} down" disabled={last} onclick={() => onmove(1)}><ArrowDownIcon class="size-3.5" /></Button>
        <Button variant="ghost" size="icon" class="size-6" aria-label="Remove {name}" onclick={onremove}><XIcon class="size-3.5" /></Button>
      {/if}
    </div>
    <div class="pointer-events-none select-none">{@render children()}</div>
  </div>
{:else}
  {@render children()}
{/if}
