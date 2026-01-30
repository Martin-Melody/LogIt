<script lang="ts">
  import { goto } from "$app/navigation";
  import { currentSession } from "$lib/stores/currentSession.store";

  import DailyGreeting from "./components/daily-greeting/DailyGreeting.svelte";
  import HeroCard from "./components/hero-card/HeroCard.svelte";
  import TodaysPlanCardContainer from "./components/todays-plan-card/TodaysPlanCardContainer.svelte";
  import RecentSessionsCardContainer from "./components/recent-sessions-card/RecentSessionsCardContainer.svelte";
  import QuickActionsRow from "./components/quick-actions-row/QuickActionsRow.svelte";

  async function startUnplanned() {
    await currentSession.start();
    await goto("/session/current");
  }

  async function continueWorkout() {
    await goto("/session/current");
  }

  async function startPlanned() {
    // MVP: you can still go to /session/current
    // Later: build from plan → currentSession.startFromPlan(...)
    await goto("/session/current");
  }

  // Flag: do we currently have a draft session?
  $: hasDraft = $currentSession !== null;

  // Flag: does a plan exist? (the container can expose plan via slot/props)
</script>

<div class="w-full flex flex-col gap-1 h-full p-3">
  <DailyGreeting />

  <HeroCard
    {hasDraft}
    onStart={startUnplanned}
    onContinue={continueWorkout}
    showPrimaryStart={!hasDraft}
  />

  <TodaysPlanCardContainer {hasDraft} onStartPlanned={startPlanned} />

  <RecentSessionsCardContainer />
  <QuickActionsRow />
</div>
