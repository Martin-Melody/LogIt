<script lang="ts">
  import { goto } from "$app/navigation";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { getHabitRepo } from "$lib/data/repoProvider";
  import type { Habit } from "@logit/core/domain/habit";
  import { bumpHabits } from "$lib/features/habits/store";
  import { homeConfig } from "$lib/stores/homeConfig.store";
  import HabitEditor from "$lib/features/habits/HabitEditor.svelte";

  let saving = $state(false);

  async function save(habit: Habit) {
    if (saving) return;
    saving = true;
    try {
      await getHabitRepo().saveHabit(habit);
      bumpHabits();
      homeConfig.seedHabitsWidget(true);
      await goto("/habits", { replaceState: true });
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 border-b border-border px-3 py-2">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center"
      onclick={() => back("/habits")}
    >
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">New habit</h1>
  </div>

  <HabitEditor onsave={save} />
</div>
