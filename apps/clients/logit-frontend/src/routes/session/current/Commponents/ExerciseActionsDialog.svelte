<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  import { Trash2 } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  import { listExercises } from "$lib/usecases/exercises/listExercises";
  import type { ExerciseOption } from "$lib/components/Exercise/ExercisePicker.svelte";
  import ExercisePicker from "$lib/components/Exercise/ExercisePicker.svelte";

  const {
    open = false,
    disabled = false,
    exerciseName,
    onOpenChange = (_v: boolean) => {},
    onRename = async (_next: string) => {},
    onDelete = async () => {},
  } = $props<{
    open?: boolean;
    disabled?: boolean;
    exerciseName: string;
    onOpenChange?: (v: boolean) => void;
    onRename?: (nextName: string) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
  }>();

  let nameDraft = $state("");
  let lastKey = $state<string | null>(null);

  const searchUi = $state({
    loading: false,
    options: [] as ExerciseOption[],
  });

  function initDraft() {
    if (!open) return;

    const key = exerciseName ?? "";
    if (lastKey === key) return;

    lastKey = key;
    nameDraft = exerciseName ?? "";
    searchUi.loading = false;
    searchUi.options = [];
  }

  $effect(() => {
    open;
    exerciseName;
    initDraft();
  });

  async function search(q: string) {
    searchUi.loading = true;
    try {
      const rows = await listExercises({ query: q, limit: 50 });
      searchUi.options = rows.map((x) => ({ id: x.id, name: x.name }));
    } finally {
      searchUi.loading = false;
    }
  }

  async function pick(opt: ExerciseOption) {
    if (disabled) return;
    if (opt.name.trim() === exerciseName.trim()) return;

    await onRename(opt.name);
    onOpenChange(false);
  }

  async function confirmDelete() {
    if (disabled) return;
    await onDelete();
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[520px]">
    <Dialog.Header>
      <Dialog.Title>Exercise actions</Dialog.Title>
      <Dialog.Description>
        Pick an exercise, rename it, or delete it.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-5 py-4">
      <div class="grid gap-2">
        <Label>Change to…</Label>
        <ExercisePicker
          {disabled}
          loading={searchUi.loading}
          options={searchUi.options}
          onSearch={search}
          onSelect={pick}
          placeholder="Search exercises…"
        />
      </div>

      <div class="w-full border">
        <ConfirmDialog
          title="Delete exercise?"
          description="This will remove the exercise and all its sets from the current session."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          saving={disabled}
          onConfirm={confirmDelete}
        >
          <Button variant="destructive" class="w-full" {disabled}>
            <Trash2 class="mr-2 h-4 w-4" />
            Delete exercise
          </Button>
        </ConfirmDialog>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
