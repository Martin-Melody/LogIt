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

  // runes mode (no $:)
  const hasDraft = $derived(() => $currentSession !== null);
  const activeSplitId = $derived(() => $activeSplit?.id ?? null);

  const todayDay = $derived(() =>
    $activeSplit ? getTodaySplitDay($activeSplit) : null,
  );
  const hasPlan = $derived(() => !!todayDay());

  // single guard to avoid double taps + UI flicker
  let starting = $state(false);

  async function navigateToCurrent() {
    await goto("/session/current");
  }

  async function startUnplanned() {
    if (starting) return;
    starting = true;

    if (hasDraft()) return navigateToCurrent();

    // navigate first (fast UI), persist in background
    await navigateToCurrent();

    void currentSession.start();
  }

  async function startPlanned() {
    if (starting) return;
    starting = true;

    if (hasDraft()) return navigateToCurrent();

    const split = $activeSplit;
    const day = todayDay();

    await navigateToCurrent();

    if (!split || !day) {
      void currentSession.start();
      return;
    }

    void currentSession.startFromSplitDay(split, day);
  }

  async function continueWorkout() {
    if (starting) return;
    starting = true;
    await navigateToCurrent();
  }
</script>

<div class="w-full flex flex-col gap-1 h-full p-3">
  <DailyGreeting />

  <HeroCard
    hasDraft={hasDraft()}
    hasPlan={hasPlan()}
    onStart={startPlanned}
    onStartUnplanned={startUnplanned}
    onContinue={continueWorkout}
    showPrimaryStart={!hasDraft()}
  />

  <TodaysPlanCard day={todayDay()} activeSplitId={activeSplitId()} />

  <RecentSessionsCardContainer />
  <QuickActionsRow />
</div>
