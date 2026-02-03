<script lang="ts">
  import { goto } from "$app/navigation";
  import { currentSession } from "$lib/stores/currentSession.store";

  import DailyGreeting from "./components/daily-greeting/DailyGreeting.svelte";
  import HeroCard from "./components/hero-card/HeroCard.svelte";
  import RecentSessionsCardContainer from "./components/recent-sessions-card/RecentSessionsCardContainer.svelte";
  import QuickActionsRow from "./components/quick-actions-row/QuickActionsRow.svelte";

  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";
  import TodaysPlanCard from "./components/todays-plan-card/TodaysPlanCard.svelte";

  $: hasDraft = $currentSession !== null;
  $: activeSplitId = $activeSplit?.id ?? null;

  $: todayDay = $activeSplit ? getTodaySplitDay($activeSplit) : null;
  $: hasPlan = !!todayDay;

  async function startUnplanned() {
    if (hasDraft) return goto("/session/current");
    await currentSession.start();
    await goto("/session/current");
  }

  async function startPlanned() {
    if (hasDraft) return goto("/session/current");
    if (!todayDay) return startUnplanned(); // fallback
    await currentSession.startFromSplitDay(todayDay);
    await goto("/session/current");
  }

  async function continueWorkout() {
    await goto("/session/current");
  }
</script>

<div class="w-full flex flex-col gap-1 h-full p-3">
  <DailyGreeting />

  <HeroCard
    {hasDraft}
    {hasPlan}
    onStart={startPlanned}
    onStartUnplanned={startUnplanned}
    onContinue={continueWorkout}
    showPrimaryStart={!hasDraft}
  />

  <TodaysPlanCard day={todayDay} {activeSplitId} />

  <RecentSessionsCardContainer />
  <QuickActionsRow />
</div>
