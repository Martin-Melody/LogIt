<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  import type { SetEntry, SetType } from "$lib/domain/workout";
  import { DEFAULT_REST_MS } from "$lib/domain/workout";
  import SetTypePicker from "./SetTypePicker.svelte";

  type Editable = Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "restDurationMs">;

  const {
    open = false,
    disabled = false,
    initial = null,
    onOpenChange = () => {},
    onSave = async () => {},
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    initial?: Omit<Editable, "restDurationMs"> & { restDurationMs?: number } | null;
    onOpenChange?: (v: boolean) => void;
    onSave?: (patch: Partial<Editable>) => void | Promise<void>;
  }>();

  const draft = $state<Editable>({
    reps: 0,
    weight: 0,
    setType: "normal" as SetType,
    note: null,
    restDurationMs: DEFAULT_REST_MS,
  });

  let lastKey = $state<string | null>(null);

  $effect(() => {
    if (!open || !initial) return;
    const key = `${initial.setType}|${initial.reps}|${initial.weight}|${initial.note ?? ""}|${initial.restDurationMs ?? ""}`;
    if (lastKey === key) return;
    lastKey = key;
    draft.reps = initial.reps ?? 0;
    draft.weight = initial.weight ?? 0;
    draft.setType = initial.setType ?? "normal";
    draft.note = initial.note ?? null;
    draft.restDurationMs = initial.restDurationMs ?? DEFAULT_REST_MS;
  });

  function num(v: string) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  const restSecs = $derived(Math.round((draft.restDurationMs ?? DEFAULT_REST_MS) / 1000));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (disabled) return;

    const patch: Partial<Editable> = {
      reps: Math.max(0, draft.reps),
      weight: Math.max(0, draft.weight),
      setType: draft.setType,
      note: draft.note?.trim() ? draft.note.trim() : null,
      restDurationMs: draft.restDurationMs ?? DEFAULT_REST_MS,
    };

    await onSave(patch);
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[425px]">
    <form onsubmit={submit}>
      <Dialog.Header>
        <Dialog.Title>Edit set</Dialog.Title>
        <Dialog.Description>
          Update the set details and save when you're done.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label>Set type</Label>
          <SetTypePicker
            value={draft.setType}
            {disabled}
            onchange={(t) => (draft.setType = t)}
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
            <Label for="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              min="0"
              step="0.5"
              value={draft.weight}
              {disabled}
              oninput={(e) =>
                (draft.weight = num((e.currentTarget as HTMLInputElement).value))}
            />
          </div>
        </div>

        <div class="grid gap-2">
          <Label for="rest">Rest (seconds)</Label>
          <Input
            id="rest"
            type="number"
            min="0"
            step="5"
            value={restSecs}
            {disabled}
            oninput={(e) =>
              (draft.restDurationMs =
                num((e.currentTarget as HTMLInputElement).value) * 1000)}
          />
        </div>

        <div class="grid gap-2">
          <Label for="note">Note</Label>
          <Textarea
            id="note"
            rows={2}
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
