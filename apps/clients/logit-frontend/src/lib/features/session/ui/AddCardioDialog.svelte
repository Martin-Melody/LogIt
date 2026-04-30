<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  const props = $props<{
    open?: boolean;
    saving?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSubmit?: (name: string) => void | Promise<void>;
  }>();

  const saving = props.saving ?? false;
  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSubmit = props.onSubmit ?? ((_n: string) => {});

  let name = $state("");

  $effect(() => {
    if (!props.open) name = "";
  });

  async function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    onOpenChange(false);
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Add cardio activity</Dialog.Title>
      <Dialog.Description>
        Name the activity, e.g. Morning run, Cycling, BJJ.
      </Dialog.Description>
    </Dialog.Header>

    <input
      class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      placeholder="Activity name"
      bind:value={name}
      disabled={saving}
      autofocus={props.open}
      onkeydown={(e) => { if (e.key === "Enter") void handleConfirm(); }}
    />

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={saving}>
        Cancel
      </Button>
      <Button disabled={!name.trim() || saving} onclick={() => void handleConfirm()}>
        Add
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
