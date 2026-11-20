<script lang="ts">
  // A workout block from a plugin (docs/plugin-workout-blocks.md, design canvas B1): drawn
  // from the plugin's declaration with the app's own parts. Without the declaration (plugin
  // removed, another phone) it's the plain view from the block's own data (B3).
  import { get } from "svelte/store";
  import { Check, ChevronDown, ChevronRight, GripVertical, Link2, MoreHorizontal, Plus, Puzzle, RotateCcw, Trash2 } from "lucide-svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { reveal } from "$lib/transitions";
  import type { BlockBaseProps } from "$lib/features/session/blocks/types";
  import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
  import {
    addEntry, fieldOptions, PLUGIN_BLOCK_PREFIX, removeEntry, setBlockFieldValue, setEntryDone, setEntryValue, updatePluginBlock,
    type BlockValue, type PluginBlockData,
  } from "@logit/core/domain/blockPlugin";
  import BlockFieldInput from "./BlockFieldInput.svelte";
  import PluginBlockView from "./PluginBlockView.svelte";
  import { formatBlockValue } from "./format";

  let { blockId, blockType, data, saving, grouped = false, gripAction, onGroup, onDelete, onMutate }: BlockBaseProps<PluginBlockData> = $props();

  const decl = $derived(blockType ? getBlockDeclaration(blockType.slice(PLUGIN_BLOCK_PREFIX.length)) : null);
  const unit = $derived($profile.weightUnit);
  let collapsed = $state(get(profile).blocksCollapsedByDefault);
  let confirmRemove = $state(false);
  let moreOpen = $state<Record<string, boolean>>({});

  const done = $derived(data.entries.filter((e) => e.done !== false));
  const open = $derived(data.entries.filter((e) => e.done === false));
  const columns = $derived(data.shape.filter(([, , , col]) => col));

  function change(fn: (d: PluginBlockData) => PluginBlockData) {
    if (!decl) return;
    void onMutate((s) => updatePluginBlock(s, blockId, decl, fn));
  }
  /** Earlier values of a text field in this block, for its suggestions. */
  const previous = (key: string) => [...new Set(data.entries.map((e) => e.values[key]).filter((v): v is string => typeof v === "string" && !!v))];
  const entryNo = (id: string) => data.entries.findIndex((e) => e.id === id) + 1;
</script>

<div class="border-t border-border bg-muted/20">
  <div class="flex items-center pl-1 pr-1">
    <button type="button" class="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
      style="touch-action: none" use:gripAction aria-label={grouped ? "Drag to reorder within the group" : "Drag to reorder"} tabindex="-1" disabled={saving}>
      <GripVertical class="h-4 w-4" />
    </button>
    <button type="button" class="flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onclick={() => (collapsed = !collapsed)} disabled={saving} aria-label={collapsed ? "Expand" : "Collapse"}>
      {#if collapsed}<ChevronRight class="h-4 w-4" />{:else}<ChevronDown class="h-4 w-4" />{/if}
    </button>
    <span class="flex min-w-0 flex-1 items-center gap-2 pl-1 pr-2">
      <Puzzle class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="truncate text-sm font-semibold">{decl?.name ?? data.name}</span>
    </span>
    <span class="shrink-0 pr-1 text-xs text-muted-foreground tabular-nums">{done.length} of {data.entries.length}</span>
    {#if !collapsed && decl}
      <button type="button" class="ml-1 flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50" disabled={saving}
        aria-label="Add {decl.entry.one.toLowerCase()}" onclick={() => change(addEntry(decl))}>
        <span class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Plus class="h-4 w-4" /></span>
      </button>
    {/if}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
        disabled={saving} aria-label="More actions for {data.name}">
        <MoreHorizontal class="h-5 w-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {#if onGroup}<DropdownMenu.Item onSelect={onGroup}><Link2 /> Superset / circuit with…</DropdownMenu.Item>{/if}
        <DropdownMenu.Item variant="destructive" onSelect={() => (confirmRemove = true)}><Trash2 /> Remove {data.name}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <ConfirmDialog title="Remove {data.name}?" description="Removes this block and everything logged in it." confirmLabel="Remove"
      {saving} onConfirm={onDelete} open={confirmRemove} onOpenChange={(v: boolean) => (confirmRemove = v)} />
  </div>

  {#if !collapsed}
    <div transition:reveal>
      {#if !decl}
        <PluginBlockView {data} missingPlugin />
      {:else}
        {#if decl.blockFields.length}
          <div class="flex flex-col gap-2.5 px-3.5 pb-2">
            {#each decl.blockFields as f (f.key)}
              <BlockFieldInput field={f} value={data.blockFields[f.key]} options={fieldOptions(decl, f)} {unit} disabled={saving}
                onchange={(v: BlockValue) => change(setBlockFieldValue(f.key, v))} />
            {/each}
          </div>
        {/if}

        {#each done as e (e.id)}
          <div class="flex min-h-11 items-center gap-2 border-t border-border/60 px-3.5 text-sm tabular-nums">
            <span class="w-16 shrink-0 text-muted-foreground">{decl.entry.one} {entryNo(e.id)}</span>
            <span class="min-w-0 flex-1 truncate">{columns.map(([k, t, label]) => [formatBlockValue(t, e.values[k], unit), t === "counter" || t === "number" || t === "scale" ? `${label} ` : ""]).filter(([v]) => v !== "–").map(([v, l]) => l + v).join(" · ")}</span>
            <button type="button" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground" aria-label="Edit {decl.entry.one.toLowerCase()} {entryNo(e.id)}"
              disabled={saving} onclick={() => change(setEntryDone(e.id, false))}><RotateCcw class="h-4 w-4" /></button>
          </div>
        {/each}

        {#each open as e (e.id)}
          {@const required = decl.fields.filter((f) => !f.optional)}
          {@const optional = decl.fields.filter((f) => f.optional)}
          <div class="flex flex-col gap-2.5 border-t border-border/60 px-3.5 py-3" transition:reveal>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">{decl.entry.one} {entryNo(e.id)}</span>
              <button type="button" class="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground" aria-label="Remove {decl.entry.one.toLowerCase()} {entryNo(e.id)}"
                disabled={saving} onclick={() => change(removeEntry(e.id))}><Trash2 class="h-4 w-4" /></button>
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              {#each required as f (f.key)}
                <div class={f.type === "counter" || f.type === "number" || f.type === "weight" || f.type === "duration" || f.type === "distance" ? "" : "col-span-2"}>
                  <BlockFieldInput field={f} value={e.values[f.key]} options={fieldOptions(decl, f)} suggestions={previous(f.key)} {unit} disabled={saving}
                    onchange={(v: BlockValue) => change(setEntryValue(e.id, f.key, v))} />
                </div>
              {/each}
            </div>
            {#if optional.length}
              {#if moreOpen[e.id]}
                <div class="flex flex-col gap-2.5" transition:reveal>
                  {#each optional as f (f.key)}
                    <BlockFieldInput field={f} value={e.values[f.key]} options={fieldOptions(decl, f)} suggestions={previous(f.key)} {unit} disabled={saving}
                      onchange={(v: BlockValue) => change(setEntryValue(e.id, f.key, v))} />
                  {/each}
                </div>
              {:else}
                <button type="button" class="min-h-10 self-start rounded-lg border border-border bg-background px-3 text-[13px] font-medium"
                  onclick={() => (moreOpen = { ...moreOpen, [e.id]: true })}>More: {optional.map((f) => f.label.toLowerCase()).join(", ")}</button>
              {/if}
            {/if}
            <button type="button" class="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={saving} onclick={() => change(setEntryDone(e.id, true))}><Check class="h-4 w-4" /> Done</button>
          </div>
        {/each}

        <p class="border-t border-border/60 px-3.5 py-2 text-[13px] text-muted-foreground">{data.summary}</p>
      {/if}
    </div>
  {/if}
</div>
