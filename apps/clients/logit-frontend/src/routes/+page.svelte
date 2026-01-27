<script>
  import { goto } from "$app/navigation";
  import { currentSession } from "$lib/stores/currentSession.store";
  import DailyGreeting from "./components/daily-greeting/DailyGreeting.svelte";
  import HeroCard from "./components/hero-card/HeroCard.svelte";
  import QuickActionsRow from "./components/quick-actions-row/QuickActionsRow.svelte";
  import RecentSessionsCardContainer from "./components/recent-sessions-card/RecentSessionsCardContainer.svelte";
  import TodaysPlanCard from "./components/todays-plan-card/TodaysPlanCard.svelte";

  async function start() {
    await currentSession.start();
    await goto("/session/current");
  }

  async function continueWorkout() {
    await goto("/session/current");
  }
</script>

<div class="w-full flex flex-col gap-1 h-full p-3">
  <DailyGreeting />
  <HeroCard
    hasDraft={$currentSession !== null}
    onStart={start}
    onContinue={continueWorkout}
  />
  <TodaysPlanCard />
  <RecentSessionsCardContainer />
  <QuickActionsRow />
</div>
