<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    Plus,
    ChevronDown,
    ChevronRight,
    EllipsisVertical,
  } from "lucide-svelte";
  import ExerciseActionsDialog from "./ExerciseActionsDialog.svelte";

  const {
    exerciseName = "",
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

  let actionsOpen = $state(false);

  const ui = $state({
    expanded: true,
  });

  async function handleAddSet() {
    ui.expanded = true;
    await onAddSet();
  }

  function toggleExpanded() {
    ui.expanded = !ui.expanded;
  }
</script>

<Card.Root
  class="w-full rounded-none py-1 px-1 shadow-none border-x-0 border-t border-b ring-0 outline-none"
>
  <Card.Header class="pb-1 px-0">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1">
          <Button
            class="m-0"
            size="icon"
            variant="ghost"
            onclick={toggleExpanded}
            disabled={saving}
            aria-label={ui.expanded ? "Collapse exercise" : "Expand exercise"}
            aria-expanded={ui.expanded}
          >
            {#if ui.expanded}
              <ChevronDown class="h-4 w-4" />
            {:else}
              <ChevronRight class="h-4 w-4" />
            {/if}
          </Button>

          <Card.Title class="text-base truncate">{exerciseName}</Card.Title>

          <Button
            class="m-0"
            size="icon"
            variant="ghost"
            onclick={() => (actionsOpen = true)}
            disabled={saving}
            aria-label="Exercise actions"
          >
            <EllipsisVertical class="h-4 w-4" />
          </Button>

          <ExerciseActionsDialog
            open={actionsOpen}
            disabled={saving}
            {exerciseName}
            onOpenChange={(v: boolean) => (actionsOpen = v)}
            {onRename}
            {onDelete}
          />
        </div>
      </div>

      <div class="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          onclick={() => void handleAddSet()}
          disabled={saving}
          aria-label="Add set"
        >
          <Plus />
        </Button>
      </div>
    </div>
  </Card.Header>

  {#if ui.expanded}
    <Card.Content class="p-0">
      {@render children?.()}
    </Card.Content>
  {/if}
</Card.Root>
