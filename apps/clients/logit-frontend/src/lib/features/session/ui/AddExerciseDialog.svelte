<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";

  const props = $props<{
    open?: boolean;
    saving?: boolean;
    title?: string;
    description?: string;
    placeholder?: string;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (selection: { name: string; exerciseId?: string }) => void | Promise<void>;
  }>();

  const saving = props.saving ?? false;
  const title = props.title ?? "Add exercise";
  const description = props.description ?? "Search your library or type a new name.";
  const placeholder = props.placeholder ?? "e.g. Bench Press";
  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSubmit = props.onSubmit ?? (async (_s: { name: string; exerciseId?: string }) => {});

  $effect(() => {
    if (!props.open) searchInput?.clear();
  });

  let searchInput = $state<ReturnType<typeof ExerciseSearchInput> | null>(null);

  async function handleConfirm(selection: { name: string; exerciseId?: string }) {
    try {
      await onSubmit(selection);
    } finally {
      onOpenChange(false);
    }
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        {description}
      </Dialog.Description>
    </Dialog.Header>

    <ExerciseSearchInput
      bind:this={searchInput}
      {placeholder}
      disabled={saving}
      autofocus={props.open}
      onConfirm={handleConfirm}
    />

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => onOpenChange(false)}
        disabled={saving}
      >
        Cancel
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
