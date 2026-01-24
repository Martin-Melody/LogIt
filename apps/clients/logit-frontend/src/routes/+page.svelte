<script>
  import DailyGreeting from "./components/daily-greeting/DailyGreeting.svelte";
  import HeroCard from "./components/hero-card/HeroCard.svelte";
  import QuickActionsRow from "./components/quick-actions-row/QuickActionsRow.svelte";
  import RecentSessionsCard from "./components/recent-sessions-card/RecentSessionsCard.svelte";
  import TodaysPlanCard from "./components/todays-plan-card/TodaysPlanCard.svelte";
</script>

<div class="w-full flex flex-col gap-1 h-full p-3">
  <DailyGreeting />
  <HeroCard />
  <TodaysPlanCard />
  <RecentSessionsCard />

  <QuickActionsRow />
</div>
