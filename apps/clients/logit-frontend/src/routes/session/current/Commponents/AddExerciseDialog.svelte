<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  import { listExercises } from "$lib/usecases/exercises/listExercises";
  import type { ExerciseOption } from "$lib/components/Exercise/ExercisePicker.svelte";
  import ExercisePicker from "$lib/components/Exercise/ExercisePicker.svelte";

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
    searchLoading: false,
    searchOptions: [] as ExerciseOption[],
  });

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (props.open) {
      ui.name = "";
      ui.error = null;
      ui.searchLoading = false;
      ui.searchOptions = [];
      queueMicrotask(() => inputEl?.focus());
    }
  });

  async function search(q: string) {
    ui.searchLoading = true;
    try {
      const rows = await listExercises({ query: q, limit: 50 });
      ui.searchOptions = rows.map((x) => ({ id: x.id, name: x.name }));
    } finally {
      ui.searchLoading = false;
    }
  }

  async function pick(opt: ExerciseOption) {
    if (saving) return;
    ui.error = null;
    await onSubmit(opt.name);
    onOpenChange(false);
  }

  async function submitTyped() {
    const name = ui.name.trim();
    if (!name) {
      ui.error = "Please enter an exercise name.";
      return;
    }

    ui.error = null;
    await onSubmit(name);
    onOpenChange(false);
  }
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[520px]">
    <Dialog.Header>
      <Dialog.Title>Add exercise</Dialog.Title>
      <Dialog.Description>
        Search and select, or type a custom name.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-5">
      <ExercisePicker
        disabled={saving}
        loading={ui.searchLoading}
        options={ui.searchOptions}
        onSearch={search}
        onSelect={pick}
      />
    </div>

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => onOpenChange(false)}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button onclick={() => void submitTyped()} disabled={saving}>Add</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
