<script lang="ts">
  // "Superset / circuit with…": tick the exercises to group with this one. Knows nothing
  // about workouts — the caller passes the rows (see features/session/grouping.ts) — so
  // the split day editor can use the same sheet.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Check, Plus, Search } from "lucide-svelte";
  import type { GroupPickerSection } from "$lib/features/session/grouping";
  import type { GroupKind } from "@logit/core/domain/workout";
  import { segment, segmentTrack } from "$lib/components/ui/choice";

  const {
    open = false,
    title,
    sections,
    picked,
    confirmLabel,
    canConfirm,
    kind = null,
    onKindChange,
    showSizeHint = true,
    saving = false,
    addAnotherDetail = "Search all exercises · added here, ticked",
    onToggle,
    onAddAnother,
    onConfirm,
    onOpenChange = (_v: boolean) => {},
  } = $props<{
    open?: boolean;
    title: string;
    sections: GroupPickerSection[];
    /** Ids ticked so far. */
    picked: string[];
    confirmLabel: string;
    /** Defaults to "something is ticked". */
    canConfirm?: boolean;
    /** For a new group: superset or circuit, as it will be made (shown as a switch). */
    kind?: GroupKind | null;
    onKindChange?: (kind: GroupKind) => void;
    /** The superset / circuit switch and its hint; off when adding to a group. */
    showSizeHint?: boolean;
    saving?: boolean;
    addAnotherDetail?: string;
    onToggle: (id: string) => void;
    /** Leave the sheet to add a new exercise; the caller brings it back ticked. */
    onAddAnother?: () => void;
    onConfirm: () => void | Promise<void>;
    onOpenChange?: (v: boolean) => void;
  }>();

  const confirmable = $derived(canConfirm ?? picked.length > 0);
  const isEmpty = $derived(sections.every((s: GroupPickerSection) => s.items.length === 0));
</script>

<Dialog.Root {open} {onOpenChange}>
  <!-- Design canvas S-group: a bottom sheet; superset or circuit first, then what joins it. -->
  <Dialog.Content sheet class="top-20 flex max-h-none flex-col gap-3 bg-card">
    <div class="flex flex-col gap-0.5 pr-8">
      <Dialog.Title class="text-[19px] font-semibold leading-snug">{title}</Dialog.Title>
      <Dialog.Description class="sr-only">Tick the exercises to group. They run in workout order.</Dialog.Description>
    </div>
    {#if showSizeHint && kind && onKindChange}
      <div class={segmentTrack} role="radiogroup" aria-label="Group type">
        {#each [["superset", "Superset"], ["circuit", "Circuit"]] as [k, text] (k)}
          <button type="button" role="radio" aria-checked={kind === k} class={segment(kind === k) + " flex-1"}
            disabled={saving || (k === "superset" && picked.length === 0)} onclick={() => onKindChange(k as GroupKind)}>{text}</button>
        {/each}
      </div>
      <p class="-mt-1 text-[13px] leading-snug text-muted-foreground">
        {kind === "circuit"
          ? "Rounds through every exercise with the countdown. Can hold cardio, mobility and plugin blocks, and can be just this one."
          : "One after the other with no rest, then rest after the round."}
      </p>
    {/if}

    <div class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      {#if isEmpty}
        <p class="py-4 text-sm text-muted-foreground">Nothing else in this workout yet.</p>
      {/if}
      {#each sections as section (section.title)}
        {#if section.items.length > 0}
          <h3 class="mb-1 mt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{section.title}</h3>
          {#each section.items as item (item.id)}
            {@const on = picked.includes(item.id)}
            <button type="button" class="flex min-h-[54px] w-full items-center gap-3 border-t border-border px-1 text-left first-of-type:border-t-0 disabled:opacity-50"
              aria-pressed={on} disabled={saving} onclick={() => onToggle(item.id)}>
              <span class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors {on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}">
                {#if on}<Check class="size-3.5" strokeWidth={3} />{/if}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-[15px]">{item.name}</span>
                <span class="block truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
            </button>
          {/each}
        {/if}
      {/each}

      {#if onAddAnother}
        <button type="button" class="flex min-h-[56px] w-full items-center gap-3 border-t border-border px-1 text-left disabled:opacity-50" disabled={saving} onclick={onAddAnother}>
          <span class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-input"><Plus class="size-3.5" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px]">Something not in this workout</span>
            <span class="block truncate text-xs text-muted-foreground">{addAnotherDetail}</span>
          </span>
          <Search class="size-4 shrink-0 text-muted-foreground" />
        </button>
      {/if}
    </div>

    <Button class="h-12 shrink-0 rounded-xl text-[15px] font-semibold" disabled={saving || !confirmable} onclick={() => void onConfirm()}>
      {confirmLabel}
    </Button>
  </Dialog.Content>
</Dialog.Root>
