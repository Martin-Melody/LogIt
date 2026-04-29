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
	} = $props<{
		title?: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		saving?: boolean;
		onConfirm?: () => void | Promise<void>;
		child?: Snippet<[{
			props: Record<string, unknown>;
		}]>;
	}>();

  const ui = $state({ open: false });

  async function confirm() {
    await onConfirm();
    ui.open = false;
  }
</script>

<Dialog.Root bind:open={ui.open}>
  <Dialog.Trigger {child} />

  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => (ui.open = false)}
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
