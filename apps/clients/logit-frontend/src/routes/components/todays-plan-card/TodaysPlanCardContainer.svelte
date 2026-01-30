<script lang="ts">
  import TodaysPlanCard from "./TodaysPlanCard.svelte";
  import { goto } from "$app/navigation";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodayPlanFromSplit } from "$lib/domain/todayPlan";

  const plan = $derived(
    $activeSplit ? getTodayPlanFromSplit($activeSplit) : null,
  );

  function edit() {
    // either go to splits list or the active split editor
    if ($activeSplit) void goto(`/splits/${$activeSplit.id}`);
    else void goto("/splits");
  }
</script>

<TodaysPlanCard {plan} onEdit={edit} />
