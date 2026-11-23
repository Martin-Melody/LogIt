<script lang="ts" module>
  import type { Icon } from "lucide-svelte";

  export type ActionItem = {
    icon: typeof Icon;
    label: string;
    /** Shown on the right, e.g. "2:00" or "Olympic bar, 20 kg". */
    value?: string | null;
    destructive?: boolean;
    disabled?: boolean;
    onSelect: () => void;
  };
</script>

<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { menuRow } from "$lib/components/ui/choice";

  // A bottom-sheet menu (design canvas S-block-menu): a title, then one row per action. A row
  // closes the sheet, then acts, so a sheet it opens isn't stacked on this one.
  const {
    open,
    onOpenChange,
    title,
    subtitle = null,
    items,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    subtitle?: string | null;
    items: ActionItem[];
  } = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet showCloseButton={false} class="gap-1 bg-card px-3">
    <div class="flex flex-col gap-0.5 px-2 pb-2">
      <Dialog.Title class="text-[19px] font-semibold">{title}</Dialog.Title>
      {#if subtitle}<Dialog.Description class="text-[13px]">{subtitle}</Dialog.Description>{:else}<Dialog.Description class="sr-only">{title} options</Dialog.Description>{/if}
    </div>
    {#each items as item (item.label)}
      <button
        type="button"
        class="{menuRow} {item.destructive ? 'text-destructive' : ''}"
        disabled={item.disabled}
        onclick={() => { onOpenChange(false); setTimeout(item.onSelect, 200); }}
      >
        <item.icon />
        <span class="min-w-0 flex-1 truncate">{item.label}</span>
        {#if item.value}<span class="max-w-[45%] shrink-0 truncate text-[13px] text-muted-foreground tabular-nums">{item.value}</span>{/if}
      </button>
    {/each}
  </Dialog.Content>
</Dialog.Root>
