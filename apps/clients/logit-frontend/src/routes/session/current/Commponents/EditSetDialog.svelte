<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import type { SetEntry, SetType } from "$lib/domain/workout";
  import type { SetTypeOption } from "$lib/data/types";

  import SetTypePicker, {
    type SetTypePickerOption,
  } from "./SetTypePicker.svelte";

  type Editable = Pick<
    SetEntry,
    "reps" | "weight" | "setType" | "note" | "completed"
  >;

  const {
    open = false,
    disabled = false,
    initial = null,
    setTypeOptions = [],
    setTypeLoading = false,
    onOpenChange = (_v: boolean) => {},
    onSave = async (_patch: Partial<Editable>) => {},
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    initial?: Editable | null;
    setTypeOptions?: SetTypeOption[];
    setTypeLoading?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSave?: (patch: Partial<Editable>) => void | Promise<void>;
  }>();

  let draft = $state<Editable>({
    reps: 0,
    weight: 0,
    setType: "normal" as SetType,
    note: null,
  });

  let lastKey = $state<string | null>(null);

  function initDraft() {
    if (!initial) return;

    const key = `${initial.setType}|${initial.reps}|${initial.weight}|${initial.note ?? ""}`;

    if (!open) return;
    if (lastKey === key) return;

    lastKey = key;

    draft = {
      reps: initial.reps ?? 0,
      weight: initial.weight ?? 0,
      setType:
        initial.setType ??
        (setTypeOptions[0]?.code as SetType) ??
        ("normal" as SetType),
      note: initial.note ?? null,
    };
  }

  $effect(() => {
    open;
    initial;
    setTypeOptions;
    initDraft();
  });

  const pickerOptions = $derived<SetTypePickerOption[]>(
    setTypeOptions.map((o: any) => ({
      id: o.id,
      code: o.code as SetType,
      label: o.label,
      subtitle: null,
    })),
  );

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

<Dialog.Root {open} {onOpenChange}>
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

          <SetTypePicker
            loading={setTypeLoading}
            disabled={disabled || setTypeLoading}
            options={pickerOptions}
            value={draft.setType}
            onSelect={(opt) => {
              draft.setType = opt.code as SetType;
            }}
          />
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
