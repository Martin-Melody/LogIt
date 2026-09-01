<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Plus, Target } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { localDateIso, type DiaryDay } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { profile } from "$lib/stores/profile.store";
  import { onForeground } from "$lib/lifecycle";
  import MacroBars from "$lib/features/nutrition/MacroBars.svelte";
  import { fmtKcal, totalsFor, type NutritionState } from "$lib/features/nutrition/nutrition";

  let loading = $state(true);
  let nut = $state<NutritionState | null>(null);
  let day = $state<DiaryDay | null>(null);

  // Recomputed on every load, not once at mount — otherwise the widget keeps showing
  // yesterday after midnight while the home screen stays mounted in the background.
  let dateIso = $state(localDateIso());
  const consumed = $derived(totalsFor(day));
  const hasTarget = $derived(!!nut?.goal || !!nut?.coachPlan);
  const kcalLeft = $derived(
    nut?.targets ? Math.round(nut.targets.kcal - consumed.kcal) : null,
  );

  const sourceBadge = $derived.by(() => {
    if (!nut?.targets) return null;
    const prominent =
      nut.targets.source === "coach" || nut.targets.sourceLabel === "Adaptive";
    return {
      label: nut.targets.sourceLabel,
      variant: prominent ? ("secondary" as const) : ("outline" as const),
    };
  });

  async function load() {
    dateIso = localDateIso();
    try {
      const fallbackKg =
        $profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null;
      const [d, n] = await Promise.all([
        getNutritionRepo().getDay(dateIso),
        getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg }),
      ]);
      day = d;
      nut = n;
    } catch {
      // leave nut null — widget shows the neutral CTA
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    // Re-pull when the app returns to the foreground so the day rolls over and any
    // meals logged elsewhere show up without navigating away and back.
    return onForeground(() => void load());
  });
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <Card.Title>Today's Nutrition</Card.Title>
      <div class="flex items-center gap-1 shrink-0">
        {#if hasTarget}
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            aria-label="Log food"
            onclick={() => void goto(`/nutrition/log?date=${dateIso}`)}
          >
            <Plus class="h-4 w-4" />
          </Button>
        {/if}
        <Button
          variant="ghost"
          class="h-7 px-2 text-xs"
          onclick={() => void goto("/nutrition")}
        >
          Open
        </Button>
      </div>
    </div>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if !hasTarget}
      <a href="/nutrition/goal" class="flex items-center gap-2 text-sm text-primary">
        <Target class="h-4 w-4" /> Set a goal for calorie &amp; macro targets
      </a>
    {:else}
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-muted-foreground">
          {#if kcalLeft != null}
            <span class="font-medium text-foreground tabular-nums">{fmtKcal(Math.abs(kcalLeft))}</span>
            {kcalLeft >= 0 ? " kcal left" : " kcal over"}
          {:else}
            Daily target
          {/if}
        </span>
        {#if sourceBadge}
          <Badge variant={sourceBadge.variant} class="text-[10px]">{sourceBadge.label}</Badge>
        {/if}
      </div>
      <MacroBars consumed={consumed} target={nut?.targets?.macros ?? null} />
    {/if}
  </Card.Content>
</Card.Root>
