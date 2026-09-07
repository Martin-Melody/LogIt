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

  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => setOpen(false)}
        disabled={saving}
      >
        {cancelLabel}
      </Button>
      <Button
        variant="destructive"
        onclick={() => void confirm()}
        disabled={saving}
      >
        {confirmLabel}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
