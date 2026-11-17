<script lang="ts">
  import { recipeBlockLines, type SharedRecipe } from "@logit/core/domain/progressionRecipe";

  // A built algorithm's blocks as label/value rows (shared posts, codes, the composer).
  const { recipe }: { recipe: SharedRecipe } = $props();
</script>

<dl class="flex flex-col gap-1.5 text-[13px]" data-testid="recipe-blocks">
  {#each recipeBlockLines(recipe) as [label, value] (label)}
    <div class="flex gap-2.5">
      <dt class="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  {/each}
</dl>
