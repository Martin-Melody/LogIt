<script lang="ts">
  import { onMount } from "svelte";
  import {
    ArrowLeft,
    ChartNoAxesColumn,
    ChevronLeft,
    ChevronRight,
    Plus,
    Target,
    Scale,
    Trash2,
    UtensilsCrossed,
    Camera,
  } from "lucide-svelte";
  import { GripVertical } from "lucide-svelte";
  import { dragHandleZone, dragHandle } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { back } from "$lib/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import {
    localDateIso,
    mealTotals,
    removeDiaryItem,
    setDiaryItems,
    updateDiaryItem,
    MEAL_SLOTS,
    type DiaryDay,
    type LoggedItem,
    type MealSlot,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getMessagesRepo } from "$lib/data/repoProvider";
  import type { CoachMessage } from "@logit/core/domain/CoachMessage";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { pushNutritionDay } from "$lib/sync/syncService";
  import { profile } from "$lib/stores/profile.store";
  import MacroBars from "$lib/features/nutrition/MacroBars.svelte";
  import WeightTrendChart from "$lib/features/nutrition/WeightTrendChart.svelte";
  import {
    fmtKcal,
    fmtWeight,
    totalsFor,
    type NutritionState,
    type WeightUnit,
  } from "$lib/features/nutrition/nutrition";

  const ui = $state({ loading: true, error: null as string | null });
  let dateIso = $state(localDateIso());
  let day = $state<DiaryDay | null>(null);
  let nut = $state<NutritionState | null>(null);
  let coachComments = $state<CoachMessage[]>([]);

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const consumed = $derived(totalsFor(day));
  const isToday = $derived(dateIso === localDateIso());
  const mealLabels: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  function shiftDate(deltaDays: number) {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    dateIso = localDateIso(d);
    void loadDay();
  }

  async function loadDay() {
    day = (await getNutritionRepo().getDay(dateIso)) ?? null;
    coachComments = await getMessagesRepo()
      .listCommentsForDate(dateIso)
      .catch(() => []);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const repo = getNutritionRepo();
      const fallbackKg = $profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null;
      const [d, n, comments] = await Promise.all([
        repo.getDay(dateIso),
        getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg }),
        getMessagesRepo().listCommentsForDate(dateIso).catch(() => []),
      ]);
      day = d;
      nut = n;
      coachComments = comments;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function deleteItem(itemId: string) {
    if (!day) return;
    const next = removeDiaryItem(day, itemId);
    day = next;
    await getNutritionRepo().saveDay(next);
    pushNutritionDay(next);
  }

  // ── Drag to reorder / move between meals (svelte-dnd-action handle zones) ──
  const FLIP_MS = 150;
  let dndItems = $state<Record<MealSlot, LoggedItem[]>>({
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  });

  // Re-derive the drag zones from the day whenever it changes (load, day switch, finalize).
  $effect(() => {
    const next: Record<MealSlot, LoggedItem[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const it of day?.items ?? []) next[it.meal].push({ ...it });
    dndItems = next;
  });

  function onConsider(meal: MealSlot, e: CustomEvent<{ items: LoggedItem[] }>) {
    dndItems[meal] = e.detail.items;
  }

  async function onFinalize(meal: MealSlot, e: CustomEvent<{ items: LoggedItem[] }>) {
    dndItems[meal] = e.detail.items;
    if (!day) return;
    const items: LoggedItem[] = [];
    for (const m of MEAL_SLOTS) for (const it of dndItems[m]) items.push({ ...it, meal: m });
    const next = setDiaryItems(day, items);
    day = next;
    await getNutritionRepo().saveDay(next);
    pushNutritionDay(next);
  }

  async function addPhoto(itemId: string) {
    if (!day) return;
    const { captureMealPhoto } = await import("$lib/features/nutrition/mealPhoto");
    const photoDataUrl = await captureMealPhoto();
    if (!photoDataUrl) return;
    const next = updateDiaryItem(day, itemId, { photoDataUrl });
    day = next;
    await getNutritionRepo().saveDay(next);
    pushNutritionDay(next);
  }

  const sourceBadge = $derived.by(() => {
    if (!nut) return null;
    if (!nut.goal && !nut.coachPlan) return null;
    if (!nut.targets) {
      return { label: nut.targetsHint ?? "Add height & birth date", variant: "outline" as const };
    }
    const prominent = nut.targets.source === "coach" || nut.targets.sourceLabel === "Adaptive";
    return { label: nut.targets.sourceLabel, variant: prominent ? ("secondary" as const) : ("outline" as const) };
  });

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Nutrition</h1>
    <a href="/nutrition/insights" class="ml-auto h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground">
      <ChartNoAxesColumn class="h-4 w-4" /> Insights
    </a>
    <a href="/nutrition/goal" class="h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground">
      <Target class="h-4 w-4" /> Goal
    </a>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  <!-- Date nav -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-border">
    <button type="button" class="h-7 w-7 flex items-center justify-center" onclick={() => shiftDate(-1)} aria-label="Previous day">
      <ChevronLeft class="h-4 w-4" />
    </button>
    <span class="text-xs font-medium">{isToday ? "Today" : dateIso}</span>
    <button
      type="button"
      class="h-7 w-7 flex items-center justify-center disabled:opacity-30"
      onclick={() => shiftDate(1)}
      disabled={isToday}
      aria-label="Next day"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <!-- Targets -->
    <div class="px-3 py-3 border-b border-border">
      {#if !nut?.goal && !nut?.coachPlan}
        <a href="/nutrition/goal" class="flex items-center gap-2 text-sm text-primary">
          <Target class="h-4 w-4" /> Set a goal for calorie &amp; macro targets
        </a>
      {:else}
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-muted-foreground">Daily target</span>
          {#if sourceBadge}<Badge variant={sourceBadge.variant} class="text-[10px]">{sourceBadge.label}</Badge>{/if}
        </div>
        {#if nut?.coachPlan?.note}
          <p class="text-[11px] text-muted-foreground mb-2 whitespace-pre-line">{nut.coachPlan.note}</p>
        {/if}
      {/if}
      <MacroBars consumed={consumed} target={nut?.targets?.macros ?? null} />
    </div>

    {#if coachComments.length}
      <div class="px-3 py-2.5 border-b border-border flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Coach comments · {isToday ? "today" : dateIso}</span>
        {#each coachComments as c (c.id)}
          <div class="rounded bg-muted/50 px-2 py-1.5 text-[11px]">
            <span class="text-muted-foreground">{c.mine ? "You" : "Coach"}</span>
            <p class="whitespace-pre-line">{c.body}</p>
          </div>
        {/each}
      </div>
    {/if}

    {#if nut?.coachPlan?.meals?.length}
      <a href="/nutrition/plan" class="flex items-center gap-2 px-3 py-2.5 border-b border-border text-sm text-primary">
        <UtensilsCrossed class="h-4 w-4" /> Your coach's meal plan
        <span class="ml-auto text-xs text-muted-foreground">{nut.coachPlan.meals.length} meals</span>
      </a>
    {/if}

    <!-- Meals — items drag to reorder within a meal or move between meals -->
    {#each MEAL_SLOTS as meal (meal)}
      {@const mt = day ? mealTotals(day, meal) : null}
      <div class="border-b border-border">
        <div class="flex items-center justify-between px-3 py-2">
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-semibold">{mealLabels[meal]}</span>
            {#if mt && mt.kcal > 0}<span class="text-[11px] text-muted-foreground tabular-nums">{fmtKcal(mt.kcal)} kcal</span>{/if}
          </div>
          <a
            href="/nutrition/log?meal={meal}&date={dateIso}"
            class="h-7 px-2 flex items-center gap-1 text-xs text-primary"
          >
            <Plus class="h-3.5 w-3.5" /> Add
          </a>
        </div>
        <ul
          class="px-3 pb-2 flex flex-col gap-1 min-h-[10px]"
          use:dragHandleZone={{
            items: dndItems[meal],
            flipDurationMs: FLIP_MS,
            type: "diary-item",
            dropTargetStyle: { outline: "2px dashed rgb(148 163 184 / 0.45)", outlineOffset: "-3px", borderRadius: "6px" },
          }}
          onconsider={(e) => onConsider(meal, e)}
          onfinalize={(e) => onFinalize(meal, e)}
        >
          {#each dndItems[meal] as it (it.id)}
            <li animate:flip={{ duration: FLIP_MS }} class="flex items-center gap-1.5 text-xs">
              <span
                use:dragHandle
                class="h-6 w-5 -ml-1 flex items-center justify-center text-muted-foreground/40 touch-none cursor-grab active:cursor-grabbing"
                aria-label="Drag to move {it.name}"
              >
                <GripVertical class="h-3.5 w-3.5" />
              </span>
              {#if it.photoDataUrl}
                <img src={it.photoDataUrl} alt="" class="h-8 w-8 rounded object-cover shrink-0" />
              {/if}
              <span class="flex-1 truncate">
                {it.name}
                {#if it.servingLabel}<span class="text-muted-foreground"> · {it.servingLabel}</span>{/if}
              </span>
              <span class="tabular-nums text-muted-foreground">{fmtKcal(it.computed.kcal)}</span>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void addPhoto(it.id)} aria-label="Add photo">
                <Camera class="h-3.5 w-3.5" />
              </button>
              <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void deleteItem(it.id)} aria-label="Remove">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}

    <!-- Weight -->
    <a href="/nutrition/weight" class="block px-3 py-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-semibold flex items-center gap-1.5"><Scale class="h-3.5 w-3.5" /> Weight</span>
        <span class="text-xs tabular-nums">
          {fmtWeight(nut?.trend.currentKg ?? null, unit)}
          {#if nut && Math.abs(nut.trend.weeklyRateKg) >= 0.05}
            <span class="text-muted-foreground">
              ({nut.trend.weeklyRateKg > 0 ? "+" : ""}{(unit === "lbs" ? nut.trend.weeklyRateKg * 2.2046 : nut.trend.weeklyRateKg).toFixed(2)}/wk)
            </span>
          {/if}
        </span>
      </div>
      {#if nut}<WeightTrendChart trend={nut.trend} unit={unit} targetKg={nut.goal?.targetWeightKg ?? null} />{/if}
    </a>
  {/if}
</div>
