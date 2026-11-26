<!-- A logged food's ⋯ and right-click menu (canvas board 13): the same items in both. -->
<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { MEAL_SLOTS, type LoggedItem, type MealSlot } from "@logit/core/domain/nutrition";

  let { item, labels, kind, onamount, onmove, ontomorrow, oncopy, ondelete }: {
    item: LoggedItem;
    labels: Record<MealSlot, string>;
    kind: "context" | "dropdown";
    onamount: () => void;
    onmove: (meal: MealSlot) => void;
    ontomorrow: () => void;
    oncopy: () => void;
    ondelete: () => void;
  } = $props();
  const M = $derived(kind === "context" ? ContextMenu : DropdownMenu);
</script>

<M.Item class="min-h-8 gap-4" disabled={!(item.grams > 0)} onSelect={onamount}>
  <span class="flex-1">Change amount…</span>{#if !(item.grams > 0)}<span class="text-xs text-muted-foreground">Quick add, no grams</span>{/if}
</M.Item>
<M.Sub>
  <M.SubTrigger class="min-h-8">Move to</M.SubTrigger>
  <M.SubContent class="min-w-36">
    {#each MEAL_SLOTS as meal (meal)}
      <M.Item class="min-h-8 gap-4" disabled={meal === item.meal} onSelect={() => onmove(meal)}>
        <span class="flex-1">{labels[meal]}</span>{#if meal === item.meal}<span class="text-xs text-muted-foreground">here</span>{/if}
      </M.Item>
    {/each}
  </M.SubContent>
</M.Sub>
<M.Separator />
<M.Item class="min-h-8" onSelect={ontomorrow}>Log it again tomorrow</M.Item>
<M.Item class="min-h-8" onSelect={oncopy}>Copy to another day…</M.Item>
<M.Separator />
<M.Item class="min-h-8" variant="destructive" onSelect={ondelete}>Delete</M.Item>
