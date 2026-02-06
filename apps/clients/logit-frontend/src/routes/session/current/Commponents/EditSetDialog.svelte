<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import type { SetEntry, SetType } from "$lib/domain/workout";
  import type { SetTypeOption } from "$lib/data/types";

  type Editable = Pick<SetEntry, "reps" | "weight" | "setType" | "note">;

  export let open = false;
  export let disabled = false;
  export let initial: Editable | null = null;

  export let setTypeOptions: SetTypeOption[] = [];
  export let setTypeLoading = false;

  export let onOpenChange: (v: boolean) => void = () => {};
  export let onSave: (
    patch: Partial<Editable>,
  ) => void | Promise<void> = async () => {};

  let draft: Editable = {
    reps: 0,
    weight: 0,
    setType: "normal" as SetType,
    note: null,
  };

  // Track which set we last initialized from
  let lastKey: string | null = null;

  function initDraft() {
    if (!initial) return;

    // key based on current "identity" of the initial set
    const key = `${initial.setType}|${initial.reps}|${initial.weight}|${initial.note ?? ""}`;

    // only initialize when open and key changed
    if (!open) return;
    if (lastKey === key) return;

    lastKey = key;

    draft = {
      reps: initial.reps ?? 0,
      weight: initial.weight ?? 0,
      setType:
        initial.setType ?? setTypeOptions[0]?.code ?? ("normal" as SetType),
      note: initial.note ?? null,
    };
  }

  // ✅ Initialize on open and when setTypeOptions arrive
  $: open, initial, setTypeOptions, initDraft();

  function num(v: string) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (disabled) return;

    const patch: Partial<Editable> = {
      reps: Math.max(0, draft.reps),
      weight: Math.max(0, draft.weight),
      setType: draft.setType,
      note: draft.note?.trim() ? draft.note.trim() : null,
    };

    await onSave(patch);
    onOpenChange(false);
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content class="sm:max-w-[425px]">
    <form on:submit={submit}>
      <Dialog.Header>
        <Dialog.Title>Edit set</Dialog.Title>
        <Dialog.Description>
          Update the set details and save when you're done.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="setType">Set type</Label>
          <select
            id="setType"
            class="w-full rounded border bg-background px-2 py-2 text-sm"
            disabled={disabled || setTypeLoading || setTypeOptions.length === 0}
            bind:value={draft.setType}
          >
            {#if setTypeLoading}
              <option value={draft.setType}>Loading…</option>
            {:else if setTypeOptions.length === 0}
              <option value={draft.setType}>No set types</option>
            {:else}
              {#each setTypeOptions as opt (opt.id)}
                <option value={opt.code}>{opt.label}</option>
              {/each}
            {/if}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-2">
            <Label for="reps">Reps</Label>
            <Input
              id="reps"
              type="number"
              min="0"
              value={draft.reps}
              {disabled}
              oninput={(e) =>
                (draft.reps = num((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div class="grid gap-2">
            <Label for="weight">Weight</Label>
            <Input
              id="weight"
              type="number"
              min="0"
              step="0.5"
              value={draft.weight}
              {disabled}
              oninput={(e) =>
                (draft.weight = num(
                  (e.currentTarget as HTMLInputElement).value,
                ))}
            />
          </div>
        </div>

        <div class="grid gap-2">
          <Label for="note">Note</Label>
          <Textarea
            id="note"
            rows={3}
            placeholder="Optional note…"
            {disabled}
            value={draft.note ?? ""}
            oninput={(e) =>
              (draft.note = (e.currentTarget as HTMLTextAreaElement).value)}
          />
        </div>
      </div>

      <Dialog.Footer>
        <Dialog.Close class={buttonVariants({ variant: "outline" })} {disabled}>
          Cancel
        </Dialog.Close>
        <Button type="submit" {disabled}>Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
