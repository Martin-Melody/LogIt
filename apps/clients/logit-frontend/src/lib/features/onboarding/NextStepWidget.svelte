<script lang="ts">
  // Home: one suggestion at a time for someone who started with a plan from onboarding
  // (design canvas O7, the dashed card): food after workout 2 (worded for their goal), a name
  // and friends after workout 3, the weekly summary after week one. A dismissed one doesn't
  // come back. Shows nothing otherwise.
  import { goto } from "$app/navigation";
  import { X } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { profile } from "$lib/stores/profile.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getNutritionRepo, getWorkoutRepo } from "$lib/data/repoProvider";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import type { TrainingGoal } from "@logit/core/domain/starterPlan";
  import { firstWeekEndIso, planStartIso } from "./firstWeek";
  import { pickNextStep, type NextStep } from "./nextStep";

  const DISMISSED_KEY = "logit:onboarding:nextStepsDismissed";

  let step = $state<NextStep | null>(null);

  function dismissed(): string[] {
    try {
      return JSON.parse(getAccountItem(DISMISSED_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  }

  $effect(() => {
    void $recentSessions;
    const name = $profile.name;
    const signedIn = authStore.isAuthenticated;
    const start = planStartIso();
    if (!start) {
      step = null;
      return;
    }
    void (async () => {
      const [workouts, goal] = await Promise.all([
        getWorkoutRepo().listAllSessions().then((s) => s.filter((x) => x.endedAtMs != null).length).catch(() => 0),
        getNutritionRepo().getGoal().catch(() => null),
      ]);
      let answers: { goal?: TrainingGoal } = {};
      try {
        answers = JSON.parse(getAccountItem("logit:onboarding:answers") ?? "{}");
      } catch {
        answers = {};
      }
      step = pickNextStep({
        workouts,
        hasFoodGoal: !!goal,
        hasName: !!name?.trim(),
        signedIn,
        firstWeekOver: localDateIso() > firstWeekEndIso(start),
        goal: answers.goal ?? null,
        dismissed: dismissed(),
      });
    })();
  });

  function dismiss() {
    if (!step) return;
    setAccountItem(DISMISSED_KEY, JSON.stringify([...dismissed(), step.id]));
    step = null;
  }
</script>

{#if step}
  <Card.Root class="w-full border-2 border-dashed border-primary/60">
    <Card.Content class="flex flex-col gap-1.5 pt-4">
      <div class="flex items-start justify-between gap-2">
        <span class="text-[15px] font-semibold">{step.title}</span>
        <button type="button" class="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center text-muted-foreground" aria-label="Dismiss" onclick={dismiss}>
          <X class="h-4 w-4" />
        </button>
      </div>
      <span class="text-sm text-muted-foreground">{step.text}</span>
      <button type="button" class="self-start min-h-11 text-sm font-semibold" onclick={() => goto(step!.href)}>{step.action}</button>
    </Card.Content>
  </Card.Root>
{/if}
