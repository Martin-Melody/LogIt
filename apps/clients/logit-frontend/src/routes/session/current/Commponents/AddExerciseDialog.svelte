<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  const props = $props<{
    open?: boolean;
    saving?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (name: string) => void | Promise<void>;
  }>();

  const saving = props.saving ?? false;
  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSubmit = props.onSubmit ?? (async (_name: string) => {});

  const ui = $state({
    name: "",
    error: null as string | null,
  });

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (props.open) {
      ui.name = "";
      ui.error = null;
      queueMicrotask(() => inputEl?.focus());
    }
  });

  async function submit() {
    const name = ui.name.trim();
    if (!name) {
      ui.error = "Please enter an exercise name.";
      return;
    }

    ui.error = null;
    await onSubmit(name);
    onOpenChange(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") onOpenChange(false);
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Add exercise</Dialog.Title>
      <Dialog.Description>
        Type a name like “Bench Press” or “Lat Pulldown”.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-3">
      <div class="grid gap-2">
        <Label for="exercise-name">Exercise name</Label>

        <Input
          id="exercise-name"
          bind:ref={inputEl}
          bind:value={ui.name}
          disabled={saving}
          onkeydown={onKeydown}
          placeholder="e.g. Bench Press"
        />

        {#if ui.error}
          <p class="text-sm text-destructive">{ui.error}</p>
        {/if}
      </div>
    </div>

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => onOpenChange(false)}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button onclick={() => void submit()} disabled={saving}>Add</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
