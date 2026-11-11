<script lang="ts">
  // "Superset / circuit with…": tick the exercises to group with this one. Knows nothing
  // about workouts — the caller passes the rows (see features/session/grouping.ts) — so
  // the split day editor can use the same sheet.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Plus, Search } from "lucide-svelte";
  import type { GroupPickerSection } from "$lib/features/session/grouping";

  const {
    open = false,
    title,
    sections,
    picked,
    confirmLabel,
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
    /** The "2 make a superset, 3 or more a circuit" line; off when adding to a group. */
    showSizeHint?: boolean;
    saving?: boolean;
    addAnotherDetail?: string;
    onToggle: (id: string) => void;
    /** Leave the sheet to add a new exercise; the caller brings it back ticked. */
    onAddAnother?: () => void;
    onConfirm: () => void | Promise<void>;
    onOpenChange?: (v: boolean) => void;
  }>();

  const isEmpty = $derived(sections.every((s: GroupPickerSection) => s.items.length === 0));
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px] max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
    <Dialog.Header class="px-5 pt-5 pb-3 pr-12 text-left">
      <Dialog.Title class="leading-snug">{title}</Dialog.Title>
      <Dialog.Description>
        Tick the exercises to group. They run in workout order, and you can drag them inside the group later.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-border">
      {#if isEmpty}
        <p class="px-5 py-4 text-sm text-muted-foreground">Nothing else in this workout yet.</p>
      {/if}
      {#each sections as section (section.title)}
        {#if section.items.length > 0}
          <p class="px-5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          {#each section.items as item (item.id)}
            <label class="flex min-h-[52px] cursor-pointer items-center gap-3 border-t border-border/60 px-5 py-2 hover:bg-muted/40">
              <input
                type="checkbox"
                class="size-5 shrink-0 accent-primary"
                checked={picked.includes(item.id)}
                disabled={saving}
                onchange={() => onToggle(item.id)}
              />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{item.name}</span>
                <span class="block truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
            </label>
          {/each}
        {/if}
      {/each}

      {#if onAddAnother}
        <button
          type="button"
          class="flex min-h-[56px] w-full items-center gap-3 border-t border-border/60 px-5 py-2 text-left hover:bg-muted/40 disabled:opacity-50"
          disabled={saving}
          onclick={onAddAnother}
        >
          <span class="flex size-5 shrink-0 items-center justify-center rounded border-[1.5px] border-dashed border-muted-foreground/60">
            <Plus class="size-3.5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">Add another exercise</span>
            <span class="block truncate text-xs text-muted-foreground">{addAnotherDetail}</span>
          </span>
          <Search class="size-4 shrink-0 text-muted-foreground" />
        </button>
      {/if}
    </div>

    <div class="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {#if showSizeHint}
        <p class="text-center text-xs text-muted-foreground">
          2 exercises make a superset, 3 or more a circuit.
        </p>
      {/if}
      <Button class="h-12 text-[15px]" disabled={saving || picked.length === 0} onclick={() => void onConfirm()}>
        {confirmLabel}
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
