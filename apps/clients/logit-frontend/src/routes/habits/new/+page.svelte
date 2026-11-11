<script lang="ts">
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import { getHabitRepo } from "$lib/data/repoProvider";
  import type { Habit } from "@logit/core/domain/habit";
  import { bumpHabits } from "$lib/features/habits/store";
  import { homeConfig } from "$lib/stores/homeConfig.store";
  import { pushHabit } from "$lib/sync/syncService";
  import HabitEditor from "$lib/features/habits/HabitEditor.svelte";

  let saving = $state(false);

  async function save(habit: Habit) {
    if (saving) return;
    saving = true;
    try {
      await getHabitRepo().saveHabit(habit);
      pushHabit(habit);
      bumpHabits();
      homeConfig.seedHabitsWidget(true);
      await goto("/habits", { replaceState: true });
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col pb-24">
  <div class="page-header">
    <BackButton onclick={() => back("/habits")} />
    <h1 class="page-title">New habit</h1>
  </div>

  <HabitEditor onsave={save} />
</div>
