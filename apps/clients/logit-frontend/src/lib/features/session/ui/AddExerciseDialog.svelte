<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";

  const {
    open = false,
    saving = false,
    title = "Add exercise",
    description = "Search your library or type a new name.",
    placeholder = "e.g. Bench Press",
    onOpenChange = (_v: boolean) => {},
    onSubmit = async (_s: { name: string; exerciseId?: string }) => {},
  } = $props<{
    open?: boolean;
    saving?: boolean;
    title?: string;
    description?: string;
    placeholder?: string;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (selection: { name: string; exerciseId?: string }) => void | Promise<void>;
  }>();

  let searchInput = $state<ReturnType<typeof ExerciseSearchInput> | null>(null);

  $effect(() => {
    if (!open) searchInput?.clear();
  });

  async function handleConfirm(selection: { name: string; exerciseId?: string }) {
    try {
      await onSubmit(selection);
    } finally {
      onOpenChange(false);
    }
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        {description}
      </Dialog.Description>
    </Dialog.Header>

    <!--
      Note: the search field is deliberately NOT disabled while `saving` — a
      background draft-autosave shouldn't lock the user out of typing. The submit
      path (handleConfirm → onSubmit) is already serialized through the session
      mutate queue, so a racing save is harmless.
    -->
    <ExerciseSearchInput
      bind:this={searchInput}
      {placeholder}
      autofocus={open}
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
