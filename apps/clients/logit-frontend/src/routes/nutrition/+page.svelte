<script lang="ts">
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import {
    ChartNoAxesColumn,
    ChevronLeft,
    ChevronRight,
    Plus,
    Target,
    Scale,
    Trash2,
    UtensilsCrossed,
    Camera,
    Carrot,
  } from "lucide-svelte";
  import { GripVertical, BookmarkPlus, CopyPlus } from "lucide-svelte";
  import { dragHandleZone, dragHandle } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { reveal, popIn } from "$lib/transitions";
  import { back } from "$lib/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import {
    copyDiaryItems,
    createDiaryDay,
    localDateIso,
    mealTemplateFromDay,
    mealTotals,
    removeDiaryItem,
    setDiaryItems,
    updateDiaryItem,
    MEAL_SLOTS,
    type DiaryDay,
    type LoggedItem,
    type MealSlot,
  } from "@logit/core/domain/nutrition";
  import DateField from "$lib/components/ui/date-field";
  import { getNutritionRepo, getMessagesRepo } from "$lib/data/repoProvider";
  import type { CoachMessage } from "@logit/core/domain/CoachMessage";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { onForeground } from "$lib/lifecycle";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { pushNutritionDay, pushMealTemplate, lastSyncedAt } from "$lib/sync/syncService";
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

  // Stays true while the user is looking at "today" — so a midnight rollover while the
  // app is backgrounded advances the view, but we don't yank them off a day they picked.
  let followingToday = $state(true);

  function shiftDate(deltaDays: number) {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    dateIso = localDateIso(d);
    followingToday = dateIso === localDateIso();
    void loadDay();
  }

  // ── Copy a previous day ──
  let showCopy = $state(false);
  let copyFromIso = $state("");
  let copyBusy = $state(false);
  let copyMsg = $state<string | null>(null);

  function dayBefore(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return localDateIso(d);
  }

  function toggleCopy() {
    showCopy = !showCopy;
    copyMsg = null;
    if (showCopy && !copyFromIso) copyFromIso = dayBefore(dateIso);
  }

  async function doCopy() {
    if (!copyFromIso || copyBusy) return;
    copyBusy = true;
    copyMsg = null;
    try {
      const repo = getNutritionRepo();
      const src = await repo.getDay(copyFromIso);
      const items = src?.items ?? [];
      if (items.length === 0) {
        copyMsg = "Nothing logged on that day.";
        return;
      }
      const next = copyDiaryItems(day ?? createDiaryDay(dateIso), items);
      day = next;
      await repo.saveDay(next);
      pushNutritionDay(next);
      showCopy = false;
    } finally {
      copyBusy = false;
    }
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

  // ── Save a meal as a reusable template ──
  let savingMeal = $state<MealSlot | null>(null);
  let templateName = $state("");

  function startSaveMeal(meal: MealSlot) {
    savingMeal = meal;
    templateName = `${mealLabels[meal]}`;
  }

  async function confirmSaveMeal() {
    if (!day || !savingMeal) return;
    const t = mealTemplateFromDay(day, savingMeal, templateName || mealLabels[savingMeal]);
    if (t.items.length === 0) {
      savingMeal = null;
      return;
    }
    await getNutritionRepo().saveMealTemplate(t);
    pushMealTemplate(t);
    savingMeal = null;
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

  // Login kicks off a background sync (authStore.login() doesn't wait for it — otherwise
  // the sign-in screen would sit on a spinner for however long a full sync takes). If this
  // page mounts before that sync lands, targets can look "incomplete" (e.g. weight history
  // not pulled yet) even though the goal is fully set. Reload once the sync that's already
  // in flight actually finishes, instead of leaving the stale/incomplete state on screen.
  let lastSyncSeen = $state<number | null>(null);
  $effect(() => {
    const t = $lastSyncedAt;
    if (lastSyncSeen === null) {
      lastSyncSeen = t;
      return;
    }
    if (t !== lastSyncSeen) {
      lastSyncSeen = t;
      void load();
    }
  });

  onMount(() => {
    void load();
    return onForeground(() => {
      if (followingToday && dateIso !== localDateIso()) dateIso = localDateIso();
      void load();
    });
  });
</script>

<div class="flex flex-col pb-24">
  <div class="page-header">
    <BackButton onclick={() => back("/")} />
    <h1 class="page-title">Nutrition</h1>
  </div>

  <nav class="flex items-center gap-1 px-1 border-b border-border text-sm text-muted-foreground">
    <a href="/nutrition/log" class="h-11 px-2.5 flex items-center gap-1.5 hover:text-foreground">
      <Carrot class="h-4 w-4" /> Foods
    </a>
    <a href="/nutrition/insights" class="h-11 px-2.5 flex items-center gap-1.5 hover:text-foreground">
      <ChartNoAxesColumn class="h-4 w-4" /> Insights
    </a>
    <a href="/nutrition/goal" class="h-11 px-2.5 flex items-center gap-1.5 hover:text-foreground">
      <Target class="h-4 w-4" /> Goal
    </a>
  </nav>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  <!-- Date nav -->
  <div class="flex items-center justify-between px-1 border-b border-border">
    <button type="button" class="h-11 w-11 flex items-center justify-center" onclick={() => shiftDate(-1)} aria-label="Previous day">
      <ChevronLeft class="h-4 w-4" />
    </button>
    <span class="text-sm font-medium">{isToday ? "Today" : dateIso}</span>
    <button
      type="button"
      class="h-11 w-11 flex items-center justify-center disabled:opacity-30"
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
        <a href="/nutrition/goal" class="mb-3 flex min-h-11 items-center gap-2 text-sm text-primary">
          <Target class="h-4 w-4" /> Set a goal for calorie &amp; macro targets
        </a>
      {:else}
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-muted-foreground">Daily target</span>
          {#if sourceBadge}<Badge variant={sourceBadge.variant} class="text-[11px]">{sourceBadge.label}</Badge>{/if}
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
          <div class="rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
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

    <!-- Copy a previous day -->
    <div class="px-3 border-b border-border">
      <button
        type="button"
        class="min-h-11 flex items-center gap-1.5 text-sm text-muted-foreground"
        onclick={toggleCopy}
      >
        <CopyPlus class="h-3.5 w-3.5" /> Copy a day
      </button>
      {#if showCopy}
        <div class="pb-3 flex flex-wrap items-end gap-2" transition:reveal>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Copy meals from</span>
            <DateField bind:value={copyFromIso} maxIso={localDateIso()} aria-label="Copy from date" class="w-[9.5rem]" />
          </label>
          <button
            type="button"
            class="h-10 px-2 text-sm text-primary"
            onclick={() => (copyFromIso = dayBefore(dateIso))}
          >
            Yesterday
          </button>
          <button
            type="button"
            class="h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 disabled:opacity-50"
            disabled={copyBusy}
            onclick={() => void doCopy()}
          >
            {copyBusy ? "Copying…" : "Copy"}
          </button>
        </div>
        {#if copyMsg}<p class="pb-3 text-xs text-muted-foreground">{copyMsg}</p>{/if}
      {/if}
    </div>

    <!-- Meals — items drag to reorder within a meal or move between meals -->
    {#each MEAL_SLOTS as meal (meal)}
      {@const mt = day ? mealTotals(day, meal) : null}
      <div class="border-b border-border">
        <div class="flex items-center justify-between pl-3 pr-1">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-semibold">{mealLabels[meal]}</span>
            {#if mt && mt.kcal > 0}<span class="text-xs text-muted-foreground tabular-nums">{fmtKcal(mt.kcal)} kcal</span>{/if}
          </div>
          <div class="flex items-center gap-1">
            {#if dndItems[meal].length > 0}
              <button
                type="button"
                class="h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Save {mealLabels[meal]} as a meal"
                onclick={() => (savingMeal === meal ? (savingMeal = null) : startSaveMeal(meal))}
              >
                <BookmarkPlus class="h-4 w-4" />
              </button>
            {/if}
            <a
              href="/nutrition/log?meal={meal}&date={dateIso}"
              class="h-11 px-3 flex items-center gap-1 text-sm text-primary"
            >
              <Plus class="h-4 w-4" /> Add
            </a>
          </div>
        </div>
        {#if savingMeal === meal}
          <form
            class="flex items-center gap-2 px-3 pb-2"
            onsubmit={(e) => { e.preventDefault(); void confirmSaveMeal(); }}
          >
            <input
              class="h-10 flex-1 bg-muted rounded-md px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Meal name"
              bind:value={templateName}
            />
            <button type="submit" class="h-10 px-3 text-sm font-medium text-primary">Save meal</button>
          </form>
        {/if}
        <ul
          class="pl-1 pr-1 pb-1 flex flex-col min-h-[10px]"
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
            <li animate:flip={{ duration: FLIP_MS }} transition:popIn class="flex min-h-11 items-center gap-1 text-sm">
              <span
                use:dragHandle
                class="h-11 w-8 shrink-0 flex items-center justify-center text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
                aria-label="Drag to move {it.name}"
              >
                <GripVertical class="h-4 w-4" />
              </span>
              {#if it.photoDataUrl}
                <img src={it.photoDataUrl} alt="" class="h-8 w-8 rounded-md object-cover shrink-0" />
              {/if}
              <a href="/nutrition/entry/{dateIso}/{it.id}" class="flex-1 min-w-0 min-h-11 flex items-center"><span class="truncate">
                {it.name}
                {#if it.servingLabel}<span class="text-muted-foreground"> · {it.servingLabel}</span>{/if}
              </span></a>
              <span class="tabular-nums text-xs text-muted-foreground">{fmtKcal(it.computed.kcal)}</span>
              <button type="button" class="h-11 w-10 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground" onclick={() => void addPhoto(it.id)} aria-label="Add photo">
                <Camera class="h-4 w-4" />
              </button>
              <button type="button" class="h-11 w-10 shrink-0 flex items-center justify-center text-muted-foreground hover:text-destructive" onclick={() => void deleteItem(it.id)} aria-label="Remove">
                <Trash2 class="h-4 w-4" />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}

    <!-- Weight -->
    <a href="/nutrition/weight" class="block px-3 py-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-semibold flex items-center gap-1.5"><Scale class="h-4 w-4" /> Weight</span>
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
