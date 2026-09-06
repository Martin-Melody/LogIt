<script lang="ts">
  import type { WeightUnit } from "@logit/core/domain/units";

  const { weightUnit = "kg" } = $props<{ weightUnit?: WeightUnit }>();
</script>

<div class="grid grid-cols-[auto_1fr_1fr_2rem] gap-2 px-3 py-1 text-xs text-muted-foreground border-b border-border">
  <span>#</span>
  <span>Reps</span>
  <span>Weight ({weightUnit})</span>
  <span></span>
</div>
