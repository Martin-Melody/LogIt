<script lang="ts">
  import type { WeightUnit } from "@logit/core/domain/units";
  const { weightUnit = "kg" } = $props<{ weightUnit?: WeightUnit }>();
</script>

<div class="grid grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_3.25rem_2.75rem] gap-1.5 px-3 pb-1 pt-2 text-xs text-muted-foreground">
  <span class="text-center">#</span>
  <span>Last</span>
  <span class="text-center">{weightUnit}</span>
  <span class="text-center">Reps</span>
  <span></span>
</div>
