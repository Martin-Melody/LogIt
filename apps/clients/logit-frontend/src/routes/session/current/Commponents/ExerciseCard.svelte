<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Plus, Pencil, Check, X, Trash2 } from "lucide-svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";

  const {
    exerciseName = "",
    setCount = 0,
    saving = false,
    onAddSet = () => {},
    onRename = () => {},
    onDelete = () => {},
    children,
  } = $props<{
    exerciseName?: string;
    setCount?: number;
    saving?: boolean;
    onAddSet?: () => void | Promise<void>;
    onRename?: (nextName: string) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
    children?: () => unknown;
  }>();

  const ui = $state({
    editing: false,
    draftName: "",
  });

  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (ui.editing) inputEl?.focus();
  });

  function startEdit() {
    ui.draftName = exerciseName;
    ui.editing = true;
  }

  async function commit() {
    const next = ui.draftName.trim();
    ui.editing = false;

    if (!next || next === exerciseName) return;
    await onRename(next);
  }

  function cancel() {
    ui.editing = false;
    ui.draftName = exerciseName;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") void commit();
    if (e.key === "Escape") cancel();
  }
</script>

<Card.Root class="w-full">
  <Card.Header class="pb-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        {#if ui.editing}
          <div class="flex items-center gap-2">
            <input
              bind:this={inputEl}
              class="w-full min-w-0 rounded border bg-background px-2 py-1 text-sm"
              value={ui.draftName}
              disabled={saving}
              oninput={(e) =>
                (ui.draftName = (e.currentTarget as HTMLInputElement).value)}
              onkeydown={onKeydown}
              onblur={() => void commit()}
            />

            <Button
              size="icon"
              variant="outline"
              onclick={() => void commit()}
              disabled={saving}
            >
              <Check />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onclick={cancel}
              disabled={saving}
            >
              <X />
            </Button>
          </div>
        {:else}
          <div class="flex items-center gap-1">
            <Card.Title class="text-base truncate">{exerciseName}</Card.Title>

            <Button
              class="m-0"
              size="icon"
              variant="ghost"
              onclick={startEdit}
              disabled={saving}
              aria-label="Rename exercise"
            >
              <Pencil class="h-4 w-4" />
            </Button>

            <ConfirmDialog
              title="Delete exercise?"
              description="This will remove the exercise and all its sets from the current session."
              confirmLabel="Delete"
              {saving}
              onConfirm={onDelete}
            >
              <Button
                size="icon"
                variant="ghost"
                disabled={saving}
                aria-label="Delete exercise"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </ConfirmDialog>
          </div>

          <Card.Description>
            {setCount} set{setCount === 1 ? "" : "s"}
          </Card.Description>
        {/if}
      </div>
      <div>
        <Button
          size="icon"
          variant="outline"
          onclick={() => void onAddSet()}
          disabled={saving}
          aria-label="Add set"
        >
          <Plus />
        </Button>
      </div>
    </div>
  </Card.Header>

  <Card.Content class="pt-2">
    {@render children?.()}
  </Card.Content>
</Card.Root>
