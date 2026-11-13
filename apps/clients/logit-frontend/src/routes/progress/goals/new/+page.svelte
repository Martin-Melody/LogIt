<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import GoalEditor from "$lib/features/goals/GoalEditor.svelte";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import type { GoalTarget } from "@logit/core/domain/goals";

  function save(target: GoalTarget, deadlineIso: string | null) {
    const goal = goalsStore.add(target, deadlineIso);
    void goto(`/progress/goals/${goal.id}`, { replaceState: true });
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/progress")} />
    <h1 class="page-title">New goal</h1>
  </PageHeader>

  <GoalEditor onsave={save} />
</div>
