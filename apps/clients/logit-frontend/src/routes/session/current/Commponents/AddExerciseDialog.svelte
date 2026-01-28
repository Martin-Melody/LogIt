<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Plus } from "lucide-svelte";

  const { saving = false, onSubmit = async () => {} } = $props<{
    saving?: boolean;
    onSubmit?: (name: string) => void | Promise<void>;
  }>();

  const ui = $state({
    open: false,
    name: "",
    error: null as string | null,
  });

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (ui.open) {
      // reset each time it opens
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
    ui.open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") ui.open = false;
  }
</script>

<Dialog.Root bind:open={ui.open}>
  <!-- Trigger button: icon only -->
  <Dialog.Trigger asChild>
    <Button
      size="icon"
      class="rounded-full shadow-lg"
      disabled={saving}
      aria-label="Add exercise"
    >
      <Plus />
    </Button>
  </Dialog.Trigger>

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
          value={ui.name}
          disabled={saving}
          oninput={(e) =>
            (ui.name = (e.currentTarget as HTMLInputElement).value)}
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
        onclick={() => (ui.open = false)}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button onclick={() => void submit()} disabled={saving}>Add</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
