<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { page } from "$app/state";
  import { back } from "$lib/navigation";
  import GoalEditor from "$lib/features/goals/GoalEditor.svelte";
  import { goalsStore, activeGoals } from "$lib/features/goals/goalsStore";
  import type { GoalTarget } from "@logit/core/domain/goals";

  const goal = $derived(activeGoals($goalsStore).find((g) => g.id === page.params.id) ?? null);

  function save(target: GoalTarget, deadlineIso: string | null) {
    if (!goal) return;
    goalsStore.update(goal.id, { target, deadlineIso });
    back(`/progress/goals/${goal.id}`);
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/progress")} />
    <h1 class="page-title">Edit goal</h1>
  </PageHeader>

  {#if goal}
    {#key goal.id}
      <GoalEditor {goal} onsave={save} />
    {/key}
  {:else}
    <p class="px-3 py-6 text-sm text-muted-foreground">This goal no longer exists.</p>
  {/if}
</div>
