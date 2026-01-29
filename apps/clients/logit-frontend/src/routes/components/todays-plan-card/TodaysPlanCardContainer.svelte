<script lang="ts">
  import { goto } from "$app/navigation";
  import TodaysPlanCard from "./TodaysPlanCard.svelte";

  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodayPlanFromSplit } from "$lib/domain/todayPlan";

  const plan = $derived(
    $activeSplit ? getTodayPlanFromSplit($activeSplit) : null,
  );

  function onEdit() {
    if (!$activeSplit) {
      void goto("/splits");
      return;
    }
    void goto(`/splits/${$activeSplit.id}`);
  }

  function onStart() {
    // MVP: later you'll implement “start workout from plan”
    // For now you can just go to session/current and you’ll wire in the plan later.
    void goto("/session/current");
  }
</script>

<TodaysPlanCard {plan} {onEdit} />
