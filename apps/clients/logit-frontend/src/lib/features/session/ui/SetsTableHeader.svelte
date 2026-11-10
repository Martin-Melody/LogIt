<script lang="ts">
  import type { WeightUnit } from "@logit/core/domain/units";
  const { weightUnit = "kg" } = $props<{ weightUnit?: WeightUnit }>();
</script>

<div class="grid grid-cols-[auto_4.5rem_minmax(0,1fr)_2.75rem] gap-2 px-3 pb-1 pt-2 text-xs text-muted-foreground">
  <span class="w-[2.1rem]">#</span>
  <span>Last time</span>
  <span>Today <span class="sr-only">(reps × {weightUnit})</span></span>
  <span></span>
</div>
