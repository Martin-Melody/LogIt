<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { Snippet } from "svelte";

	const {
		title = "Are you sure?",
		description = "This action cannot be undone.",
		confirmLabel = "Delete",
		cancelLabel = "Cancel",
		saving = false,
		onConfirm = async () => {},
		child,
		// Controlled mode: pass `open` + `onOpenChange` and omit `child`.
		open = undefined,
		onOpenChange = undefined,
	} = $props<{
		title?: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		saving?: boolean;
		onConfirm?: () => void | Promise<void>;
		child?: Snippet<[{ props: Record<string, unknown> }]>;
		open?: boolean;
		onOpenChange?: (v: boolean) => void;
	}>();

  const controlled = $derived(open !== undefined);
  const ui = $state({ open: false });
  const isOpen = $derived(controlled ? !!open : ui.open);

  function setOpen(v: boolean) {
    if (controlled) onOpenChange?.(v);
    else ui.open = v;
  }

  async function confirm() {
    await onConfirm();
    setOpen(false);
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={setOpen}>
  {#if child}
    <Dialog.Trigger {child} />
  {/if}

  <!-- A bottom sheet like every other one (design canvas S-confirm): the action first, full width. -->
  <Dialog.Content sheet showCloseButton={false} class="gap-3 bg-card">
    <div class="flex flex-col gap-1.5">
      <Dialog.Title class="text-[19px] font-semibold">{title}</Dialog.Title>
      <Dialog.Description class="text-sm leading-relaxed">{description}</Dialog.Description>
    </div>
    <div class="mt-1.5 flex flex-col gap-2">
      <Button variant="destructive" class="h-12 w-full rounded-xl text-[15px] font-semibold" onclick={() => void confirm()} disabled={saving}>
        {confirmLabel}
      </Button>
      <Button variant="secondary" class="h-12 w-full rounded-xl border border-input text-[15px]" onclick={() => setOpen(false)} disabled={saving}>
        {cancelLabel}
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
