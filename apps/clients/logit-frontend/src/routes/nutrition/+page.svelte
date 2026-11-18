<script lang="ts">
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import {
    BookMarked,
    Bookmark,
    Camera,
    ChartNoAxesColumn,
    CalendarDays,
    ChevronDown,
    GripVertical,
    Copy,
    Ellipsis,
    MoveHorizontal,
    Plus,
    Search,
    Target,
    Trash2,
    UtensilsCrossed,
    Zap,
    ChevronRight,
  } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { dragHandleZone, dragHandle, TRIGGERS } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { toast } from "$lib/components/ui/sonner";
  import DateField from "$lib/components/ui/date-field";
  import {
    copyDiaryItems,
    createDiaryDay,
    dayTotals,
    dayNutrients,
    hasLabelNutrients,
    hasMicros,
    localDateIso,
    mealTemplateFromDay,
    mealTotals,
    removeDiaryItem,
    setDiaryItems,
    updateDiaryItem,
    MEAL_SLOTS,
    type DiaryDay,
    type FoodRef,
    type LoggedItem,
    type MacroTotals,
    type MealSlot,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo, getMessagesRepo } from "$lib/data/repoProvider";
  import type { CoachMessage } from "@logit/core/domain/CoachMessage";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { onForeground } from "$lib/lifecycle";
  import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import {
    pushMealTemplate,
    lastSyncedAt,
    firstDownloadAt,
    syncRunning,
    lastSyncFailed,
    planIncludesSync,
  } from "$lib/sync/syncService";
  import { authStore } from "$lib/api/authStore.svelte";
  import { firstDownloadState } from "$lib/sync/firstDownload";
  import FirstDownloadNotice from "$lib/sync/FirstDownloadNotice.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { fmtWeight, totalsFor, type NutritionState, type WeightUnit } from "$lib/features/nutrition/nutrition";
  import { basisForItem } from "$lib/features/nutrition/resolveFood";
  import { addItems, saveDay } from "$lib/features/nutrition/diary";
  import AmountSheet, { type AmountResult } from "$lib/features/nutrition/ui/AmountSheet.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import QuickAddSheet from "$lib/features/nutrition/ui/QuickAddSheet.svelte";
  import WeekStrip from "$lib/features/nutrition/ui/WeekStrip.svelte";
  import { MEAL_LABELS, fmtNum, macroLine } from "$lib/features/nutrition/ui/meals";
  import { chip } from "$lib/features/nutrition/ui/style";

  const ui = $state({ loading: true, error: null as string | null });
  let dateIso = $state(localDateIso());
  let stripEnd = $state(localDateIso());
  let day = $state<DiaryDay | null>(null);
  let prevDay = $state<DiaryDay | null>(null);
  let weekKcal = $state<Record<string, number>>({});
  let nut = $state<NutritionState | null>(null);
  let coachComments = $state<CoachMessage[]>([]);

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const eaten = $derived(totalsFor(day));
  const target = $derived<MacroTotals | null>(nut?.targets?.macros ?? null);
  const isToday = $derived(dateIso === localDateIso());
  let followingToday = $state(true);

  function addDays(iso: string, n: number): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return localDateIso(d);
  }

  function selectDate(iso: string) {
    generation++;
    dateIso = iso;
    followingToday = iso === localDateIso();
    void loadDay();
  }

  function shiftWeek(weeks: number) {
    const today = localDateIso();
    const next = addDays(stripEnd, weeks * 7);
    stripEnd = next > today ? today : next;
    selectDate(stripEnd);
    void loadWeek();
  }

  // Bumped on every edit and date change, so a reload that started earlier can't put an
  // older copy of the day back on screen.
  let generation = 0;

  async function loadDay() {
    const repo = getNutritionRepo();
    const gen = generation;
    const [d, p, comments] = await Promise.all([
      repo.getDay(dateIso),
      repo.getDay(addDays(dateIso, -1)),
      getMessagesRepo().listCommentsForDate(dateIso).catch(() => []),
    ]);
    if (gen !== generation) return;
    day = d;
    prevDay = p;
    coachComments = comments;
  }

  async function loadWeek() {
    const days = await getNutritionRepo().listDaysInRange(addDays(stripEnd, -6), stripEnd);
    weekKcal = Object.fromEntries(days.filter((d) => !d.deletedAtMs).map((d) => [d.dateIso, dayTotals(d).kcal]));
  }

  async function load() {
    ui.error = null;
    try {
      const fallbackKg = $profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null;
      const [n] = await Promise.all([
        getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg }),
        loadDay(),
        loadWeek(),
      ]);
      nut = n;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function commit(next: DiaryDay) {
    generation++;
    day = next;
    await saveDay(next);
    void loadWeek();
  }

  // ── Editing an entry ──
  let editing = $state<null | { item: LoggedItem; food: FoodRef; realGrams: boolean }>(null);

  async function openItem(it: LoggedItem) {
    const basis = await basisForItem(it);
    if (!basis) {
      quickEdit = it;
      return;
    }
    editing = {
      item: it,
      food: {
        id: it.sourceId ?? it.id,
        source: "custom",
        name: it.name,
        brand: it.brand,
        per100g: basis.per100g,
        servings: basis.servings,
        ...(basis.nutrients ? { nutrients: basis.nutrients } : {}),
      },
      realGrams: !(it.sourceKind === "recipe" && basis.servings.some((s) => s.label === "1 serving")),
    };
  }

  async function saveEdit(r: AmountResult) {
    if (!editing || !day) return;
    const next = updateDiaryItem(day, editing.item.id, {
      grams: r.grams,
      servingLabel: r.label,
      amount: r.amount,
      portionId: r.portionId,
      computed: r.computed,
      nutrients: r.nutrients,
      meal: r.meal ?? editing.item.meal,
    });
    editing = null;
    await commit(next);
  }

  async function deleteItem(it: LoggedItem) {
    if (!day) return;
    const before = day;
    editing = null;
    await commit(removeDiaryItem(day, it.id));
    toast(`Removed ${it.name}`, { action: { label: "Undo", onClick: () => void commit(before) } });
  }

  async function addPhoto(it: LoggedItem) {
    if (!day) return;
    const { captureMealPhoto } = await import("$lib/features/nutrition/mealPhoto");
    const photoDataUrl = await captureMealPhoto();
    if (!photoDataUrl || !day) return;
    editing = null;
    await commit(updateDiaryItem(day, it.id, { photoDataUrl }));
  }

  // Quick-add entries (no weight): edit the numbers directly.
  let quickEdit = $state<LoggedItem | null>(null);
  let quickNew = $state<MealSlot | null>(null);

  async function saveQuick(r: { name: string; computed: MacroTotals; meal: MealSlot }) {
    if (quickEdit && day) {
      const id = quickEdit.id;
      quickEdit = null;
      await commit(updateDiaryItem(day, id, { name: r.name, computed: r.computed, meal: r.meal }));
      return;
    }
    quickNew = null;
    const { day: d } = await addItems(dateIso, [{ meal: r.meal, name: r.name, grams: 0, computed: r.computed }]);
    generation++;
    day = d;
    void loadWeek();
  }

  // ── Folding meals ──
  const COLLAPSED_KEY = "logit:nutrition:collapsedMeals:v1";
  function readCollapsed(): MealSlot[] {
    try {
      const v = JSON.parse(getAccountItem(COLLAPSED_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is MealSlot => MEAL_SLOTS.includes(x)) : [];
    } catch {
      return [];
    }
  }
  let collapsed = $state<MealSlot[]>(readCollapsed());
  function toggleMeal(m: MealSlot) {
    collapsed = collapsed.includes(m) ? collapsed.filter((x) => x !== m) : [...collapsed, m];
    try {
      setAccountItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* remembered for this visit only */
    }
  }

  // ── Dragging foods (svelte-dnd-action handle zones, one per meal) ──
  // Every meal keeps a zone, folded ones too (with no rows), because the library only
  // knows the zones that exist when a drag starts.
  const FLIP_MS = 150;
  let dragging = $state(false);
  let dndItems = $state<Record<MealSlot, LoggedItem[]>>({ breakfast: [], lunch: [], dinner: [], snack: [] });

  $effect(() => {
    const next: Record<MealSlot, LoggedItem[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const it of day?.items ?? []) if (!collapsed.includes(it.meal)) next[it.meal].push({ ...it });
    dndItems = next;
  });

  function onConsider(m: MealSlot, e: CustomEvent<{ items: LoggedItem[]; info: { trigger: string } }>) {
    dndItems[m] = e.detail.items;
    if (e.detail.info.trigger === TRIGGERS.DRAG_STARTED) dragging = true;
  }

  async function onFinalize(m: MealSlot, e: CustomEvent<{ items: LoggedItem[] }>) {
    dndItems[m] = e.detail.items;
    dragging = false;
    if (!day) return;
    const inZones = new Set(Object.values(dndItems).flat().map((d) => d.id));
    const items: LoggedItem[] = [];
    for (const slot of MEAL_SLOTS) {
      // A folded meal's own foods aren't in its zone; keep them, then add anything dropped on it.
      if (collapsed.includes(slot)) items.push(...day.items.filter((it) => it.meal === slot && !inZones.has(it.id)));
      for (const it of dndItems[slot]) items.push({ ...it, meal: slot });
    }
    const before = day.items.map((it) => `${it.id}:${it.meal}`).join();
    if (items.map((it) => `${it.id}:${it.meal}`).join() === before) return;
    const moved = e.detail.items.find((it) => day!.items.find((d) => d.id === it.id)?.meal !== m);
    await commit(setDiaryItems(day, items));
    if (moved && collapsed.includes(m)) toast(`Moved ${moved.name} to ${MEAL_LABELS[m].toLowerCase()}`);
  }

  // ── Meal menu ──
  let menuFor = $state<MealSlot | null>(null);
  let menuMode = $state<"menu" | "copyDay" | "save" | "move">("menu");
  let copyFromIso = $state("");
  let templateName = $state("");

  function openMenu(m: MealSlot) {
    menuFor = m;
    menuMode = "menu";
    copyFromIso = addDays(dateIso, -1);
    templateName = MEAL_LABELS[m];
  }

  function itemsIn(d: DiaryDay | null, m: MealSlot): LoggedItem[] {
    return (d?.items ?? []).filter((it) => it.meal === m);
  }

  async function copyFrom(fromIso: string, m: MealSlot) {
    const src = fromIso === addDays(dateIso, -1) ? prevDay : await getNutritionRepo().getDay(fromIso);
    const items = itemsIn(src, m);
    menuFor = null;
    if (items.length === 0) {
      toast(`Nothing logged at ${MEAL_LABELS[m].toLowerCase()} that day.`);
      return;
    }
    const base = day ?? createDiaryDay(dateIso);
    await commit(copyDiaryItems(base, items, m));
  }

  async function saveTemplate(m: MealSlot) {
    if (!day) return;
    const t = mealTemplateFromDay(day, m, templateName.trim() || MEAL_LABELS[m]);
    menuFor = null;
    if (t.items.length === 0) return;
    await getNutritionRepo().saveMealTemplate(t);
    pushMealTemplate(t);
    toast(`Saved "${t.name}". Find it under Meals when adding food.`);
  }

  async function moveAll(from: MealSlot, to: MealSlot) {
    if (!day) return;
    menuFor = null;
    await commit(setDiaryItems(day, day.items.map((it) => (it.meal === from ? { ...it, meal: to } : it))));
  }

  async function clearMeal(m: MealSlot) {
    if (!day) return;
    const before = day;
    menuFor = null;
    await commit(setDiaryItems(day, day.items.filter((it) => it.meal !== m)));
    toast(`Cleared ${MEAL_LABELS[m].toLowerCase()}`, { action: { label: "Undo", onClick: () => void commit(before) } });
  }

  function addHref(m: MealSlot): string {
    return `/nutrition/log?meal=${m}&date=${dateIso}`;
  }

  // ── Targets badge ──
  const sourceBadge = $derived.by(() => {
    if (!nut || (!nut.goal && !nut.coachPlan)) return null;
    if (!nut.targets) return nut.targetsHint ?? "Add height & birth date";
    return nut.targets.sourceLabel;
  });

  // Right after signing in the diary is still downloading: say so, and show placeholders
  // instead of "Nothing yet". Logging food works meanwhile.
  const firstDownload = $derived(
    firstDownloadState({
      signedIn: authStore.isAuthenticated,
      syncs: authStore.isAuthenticated && planIncludesSync(),
      downloadedAt: $firstDownloadAt,
      running: $syncRunning,
      failed: $lastSyncFailed,
    }),
  );

  // Login starts a background sync; reload once it lands so targets aren't stale. The first
  // download counts too: it lands even when an unrelated part of the sync failed.
  let lastSyncSeen = $state<number | null>(null);
  $effect(() => {
    const t = $lastSyncedAt + $firstDownloadAt;
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
      if (followingToday && dateIso !== localDateIso()) {
        dateIso = localDateIso();
        stripEnd = dateIso;
      }
      void load();
    });
  });

  function pct(n: number, of: number | undefined): number {
    return of && of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0;
  }
  const kcalLeft = $derived(target ? target.kcal - eaten.kcal : null);

  // Fibre, sugar, sat fat and salt so far, once anything logged today knows them.
  const dayLabel = $derived.by(() => {
    const items = day?.items ?? [];
    if (!items.some((it) => hasLabelNutrients(it.nutrients) || hasMicros(it.nutrients))) return null;
    const totals = dayNutrients(items).totals;
    const fmt = (v: number | undefined, dp: number) => (v === undefined ? "–" : String(Math.round(v * 10 ** dp) / 10 ** dp));
    return [
      { id: "fibreG", label: "fibre g", value: fmt(totals.fibreG, 0), goal: "30" },
      { id: "sugarG", label: "sugar g", value: fmt(totals.sugarG, 0), goal: "" },
      { id: "satFatG", label: "sat fat g", value: fmt(totals.satFatG, 0), goal: "30" },
      { id: "saltG", label: "salt g", value: fmt(totals.saltG, 1), goal: "6" },
    ];
  });
</script>

<PageHeader>
  <BackButton onclick={() => back("/")} />
  <h1 class="page-title flex-1">Nutrition</h1>
  <a href="/nutrition/lookup" class="flex size-11 items-center justify-center rounded-lg text-muted-foreground" aria-label="Look up a food">
    <Search class="size-5" />
  </a>
  <a href="/insights/eating" class="flex size-11 items-center justify-center rounded-lg text-muted-foreground" aria-label="Insights">
    <ChartNoAxesColumn class="size-5" />
  </a>
  <a href="/nutrition/foods" class="-mr-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground" aria-label="My foods and recipes">
    <BookMarked class="size-5" />
  </a>
</PageHeader>

<div class="flex flex-col pb-8">
  <WeekStrip
    endIso={stripEnd}
    selectedIso={dateIso}
    kcalByDate={weekKcal}
    targetKcal={target?.kcal ?? null}
    onselect={selectDate}
    onshift={shiftWeek}
  />

  {#if ui.error}<p class="px-4 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if firstDownload}
    <div class="px-3 pb-3">
      <FirstDownloadNotice
        status={firstDownload}
        subject="diary"
        detail="Meals, goal and weigh-ins. You can still log food now."
      />
    </div>
  {/if}

  {#if ui.loading}
    <p class="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <div class="flex flex-col gap-3 px-3">
      <!-- Summary: opens the goal -->
      <div class="rounded-2xl border border-border bg-card dark:border-transparent">
      <a href="/nutrition/goal" class="block rounded-2xl p-4 text-inherit" data-testid="day-summary">
        {#if firstDownload && !nut?.goal && !nut?.coachPlan}
          {#if firstDownload === "loading"}
            <span class="block h-4 w-3/4 animate-pulse rounded-md bg-muted"></span>
            <span class="mt-2.5 block h-3 w-1/2 animate-pulse rounded-md bg-muted"></span>
          {:else}
            <span class="block text-sm text-muted-foreground">Your goal hasn't downloaded yet.</span>
          {/if}
        {:else if !nut?.goal && !nut?.coachPlan}
          <span class="flex items-center gap-2 text-sm font-medium"><Target class="size-4" /> Set a goal to get calorie and macro targets</span>
          <span class="mt-1 block text-xs text-muted-foreground tabular-nums">Eaten so far: {fmtNum(eaten.kcal)} kcal · {macroLine(eaten)}</span>
        {:else}
          <span class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">{kcalLeft !== null && kcalLeft < 0 ? "Over by" : "Calories left"}</span>
            {#if sourceBadge}<span class="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{sourceBadge}</span>{/if}
          </span>
          <span class="mt-1 flex items-baseline gap-2.5">
            <span class="text-[40px] font-bold leading-tight tracking-tight tabular-nums">{kcalLeft !== null ? fmtNum(Math.abs(kcalLeft)) : fmtNum(eaten.kcal)}</span>
            {#if target}<span class="text-xs text-muted-foreground tabular-nums">{fmtNum(target.kcal)} goal − {fmtNum(eaten.kcal)} eaten</span>{/if}
          </span>
          <span class="mt-2.5 block h-2 overflow-hidden rounded-full bg-muted">
            <span class="block h-full rounded-full {kcalLeft !== null && kcalLeft < 0 ? 'bg-destructive' : 'bg-foreground'}" style="width: {pct(eaten.kcal, target?.kcal)}%"></span>
          </span>
          {#if target}
            <span class="mt-4 grid grid-cols-3 gap-3.5">
              {#each [["Protein", eaten.proteinG, target.proteinG, "bg-macro-protein"], ["Carbs", eaten.carbsG, target.carbsG, "bg-macro-carbs"], ["Fat", eaten.fatG, target.fatG, "bg-macro-fat"]] as [label, got, goal, color] (label)}
                <span class="block">
                  <span class="flex justify-between text-xs"><span class="font-semibold">{label}</span><span class="text-muted-foreground tabular-nums">{Math.round(got as number)}/{Math.round(goal as number)}</span></span>
                  <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full {color}" style="width: {pct(got as number, goal as number)}%"></span></span>
                  <span class="mt-1 block text-[11px] text-muted-foreground tabular-nums">{(goal as number) - (got as number) >= 0 ? `${Math.round((goal as number) - (got as number))} g left` : `${Math.round((got as number) - (goal as number))} g over`}</span>
                </span>
              {/each}
            </span>
          {/if}
        {/if}
      </a>
      {#if dayLabel}
        <a
          href="/nutrition/nutrients?date={dateIso}"
          class="mx-4 flex min-h-12 items-center gap-2.5 border-t border-border py-1.5 text-inherit"
          data-testid="day-nutrients-link"
        >
          <span class="grid flex-1 grid-cols-4 gap-1.5">
            {#each dayLabel as n (n.id)}
              <span class="block">
                <span class="block text-[13px] font-semibold tabular-nums">{n.value}{#if n.goal}<span class="font-normal text-muted-foreground">/{n.goal}</span>{/if}</span>
                <span class="block text-[11px] text-muted-foreground">{n.label}</span>
              </span>
            {/each}
          </span>
          <span class="flex items-center gap-0.5 whitespace-nowrap text-xs font-medium">All nutrients<ChevronRight class="size-4" /></span>
        </a>
      {/if}
      </div>

      {#if nut?.coachPlan?.note}
        <p class="whitespace-pre-line px-1 text-xs text-muted-foreground">{nut.coachPlan.note}</p>
      {/if}
      {#if coachComments.length}
        <div class="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-3 dark:border-transparent">
          <span class="text-xs text-muted-foreground">Coach comments · {isToday ? "today" : dateIso}</span>
          {#each coachComments as c (c.id)}
            <div class="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
              <span class="text-muted-foreground">{c.mine ? "You" : "Coach"}</span>
              <p class="whitespace-pre-line">{c.body}</p>
            </div>
          {/each}
        </div>
      {/if}
      {#if nut?.coachPlan?.meals?.length}
        <a href="/nutrition/plan" class="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium dark:border-transparent">
          <UtensilsCrossed class="size-4" /> Your coach's meal plan
          <span class="ml-auto text-xs text-muted-foreground">{nut.coachPlan.meals.length} meals</span>
        </a>
      {/if}

      <!-- Meals: tap a header to fold it; drag a food by its grip to reorder it or move it
           to another meal (folded and empty meals show a drop strip while dragging). -->
      {#each MEAL_SLOTS as m (m)}
        {@const all = itemsIn(day, m)}
        {@const mt = day ? mealTotals(day, m) : null}
        {@const yesterday = itemsIn(prevDay, m)}
        {@const open = !collapsed.includes(m)}
        <section class="select-none overflow-hidden rounded-2xl border border-border bg-card dark:border-transparent" data-testid="meal-{m}">
          <div class="flex items-center py-0.5 pl-1 pr-1">
            <button
              type="button"
              class="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg pl-2 text-left"
              aria-expanded={open}
              aria-controls="meal-items-{m}"
              onclick={() => toggleMeal(m)}
            >
              <ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform {open ? '' : '-rotate-90'}" />
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-semibold">{MEAL_LABELS[m]}</span>
                <span class="block truncate text-xs text-muted-foreground tabular-nums">
                  {#if all.length && mt}{fmtNum(mt.kcal)} kcal · {macroLine(mt)}{#if !open}{` · ${all.length} item${all.length === 1 ? "" : "s"}`}{/if}{:else if firstDownload === "loading"}<span class="mt-1 block h-3 w-1/2 animate-pulse rounded-md bg-muted" aria-label="Loading"></span>{:else if firstDownload}Not downloaded yet{:else}Nothing yet{/if}
                </span>
              </span>
            </button>
            <a href={addHref(m)} class="flex size-11 shrink-0 items-center justify-center" aria-label="Add food to {MEAL_LABELS[m]}">
              <span class="flex size-8 items-center justify-center rounded-full bg-muted"><Plus class="size-4" strokeWidth={2.4} /></span>
            </a>
            <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground" aria-label="{MEAL_LABELS[m]} options" onclick={() => openMenu(m)}>
              <Ellipsis class="size-5" />
            </button>
          </div>

          <ul
            id="meal-items-{m}"
            class="flex flex-col {dragging && dndItems[m].length === 0 ? `mx-3 mb-3 min-h-12 items-center justify-center rounded-xl border border-dashed border-muted-foreground/40 after:text-xs after:text-muted-foreground after:content-['Drop_here']` : ''}"
            use:dragHandleZone={{
              items: dndItems[m],
              flipDurationMs: FLIP_MS,
              type: "diary-item",
              dropTargetStyle: {},
            }}
            onconsider={(e) => onConsider(m, e)}
            onfinalize={(e) => onFinalize(m, e)}
          >
            {#each dndItems[m] as it (it.id)}
              <li animate:flip={{ duration: FLIP_MS }} class="flex w-full items-center border-t border-border bg-card">
                <span
                  use:dragHandle
                  aria-label="Drag to move {it.name}"
                  class="flex h-[52px] w-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
                >
                  <GripVertical class="size-4" />
                </span>
                <button type="button" class="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 pr-4 text-left" aria-label="{it.name}, {fmtNum(it.computed.kcal)} kcal" onclick={() => void openItem(it)}>
                  {#if it.photoDataUrl}<img src={it.photoDataUrl} alt="" class="size-8 shrink-0 rounded-md object-cover" />{/if}
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">
                      {it.name}
                      {#if it.sourceKind === "recipe"}<span class="ml-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground">Recipe</span>{/if}
                    </span>
                    <span class="block truncate text-xs text-muted-foreground">{it.servingLabel ?? (it.grams > 0 ? `${Math.round(it.grams)} g` : "Quick add")}</span>
                  </span>
                  <span class="font-medium tabular-nums">{fmtNum(it.computed.kcal)}</span>
                </button>
              </li>
            {/each}
          </ul>

          {#if open && all.length === 0 && !dragging && yesterday.length}
            <button
              type="button"
              class="flex h-10 w-full items-center gap-2 px-4 pb-1 text-left text-[13px] text-muted-foreground"
              onclick={() => void copyFrom(addDays(dateIso, -1), m)}
            >
              <Copy class="size-4 shrink-0" />
              <span class="tabular-nums">Same as yesterday · {fmtNum(yesterday.reduce((n, i) => n + i.computed.kcal, 0))} kcal</span>
            </button>
          {/if}
        </section>
      {/each}

      <!-- Weight -->
      <a href="/nutrition/weight" class="flex items-center gap-3.5 rounded-2xl bg-card px-4 py-3.5 border border-border dark:border-transparent">
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-muted-foreground">Weight trend</span>
          <span class="flex items-baseline gap-2">
            {#if firstDownload === "loading" && nut?.trend.currentKg == null}
              <span class="my-2 block h-4 w-20 animate-pulse rounded-md bg-muted" aria-label="Loading"></span>
            {:else}
              <span class="text-[22px] font-bold tabular-nums">{fmtWeight(nut?.trend.currentKg ?? null, unit)}</span>
            {/if}
            {#if nut && Math.abs(nut.trend.weeklyRateKg) >= 0.05}
              <span class="text-xs text-muted-foreground tabular-nums">
                {nut.trend.weeklyRateKg > 0 ? "+" : ""}{(unit === "lbs" ? nut.trend.weeklyRateKg * 2.2046 : nut.trend.weeklyRateKg).toFixed(2)} / wk
              </span>
            {/if}
          </span>
        </span>
        <span class="rounded-lg bg-muted px-3.5 py-2 text-[13px] font-medium">Log</span>
      </a>
    </div>
  {/if}
</div>


{#if editing}
  {@const ed = editing}
  <AmountSheet
    food={ed.food}
    subtitle={ed.item.brand}
    rawUnits={ed.realGrams}
    initial={{ amount: ed.item.amount, portionId: ed.item.portionId, grams: ed.item.grams }}
    day={target ? { eaten: { kcal: eaten.kcal - ed.item.computed.kcal, proteinG: eaten.proteinG - ed.item.computed.proteinG, carbsG: eaten.carbsG - ed.item.computed.carbsG, fatG: eaten.fatG - ed.item.computed.fatG }, target } : null}
    meal={ed.item.meal}
    confirmText={() => "Save"}
    ondelete={() => void deleteItem(ed.item)}
    onconfirm={(r) => void saveEdit(r)}
    onclose={() => (editing = null)}
  >
    {#snippet extra()}
      <button type="button" class="flex items-center gap-2 text-xs font-medium" onclick={() => void addPhoto(ed.item)}>
        <Camera class="size-4" />{ed.item.photoDataUrl ? "Change photo" : "Add a photo"}
      </button>
    {/snippet}
  </AmountSheet>
{/if}

{#if quickNew || quickEdit}
  <QuickAddSheet meal={quickEdit?.meal ?? quickNew ?? "snack"} onadd={(r) => void saveQuick(r)} onclose={() => { quickNew = null; quickEdit = null; }} />
{/if}

{#if menuFor}
  {@const m = menuFor}
  {@const items = itemsIn(day, m)}
  {@const yest = itemsIn(prevDay, m)}
  {@const mt = day ? mealTotals(day, m) : null}
  <BottomSheet label="{MEAL_LABELS[m]} options" onclose={() => (menuFor = null)}>
    <div class="border-b border-border px-5 pt-1 pb-3">
      <h2 class="text-lg font-bold">{MEAL_LABELS[m]}</h2>
      <p class="text-xs text-muted-foreground tabular-nums">
        {#if items.length && mt}{items.length} item{items.length === 1 ? "" : "s"} · {fmtNum(mt.kcal)} kcal · {macroLine(mt)}{:else}Nothing logged{/if}
      </p>
    </div>
    {#if menuMode === "menu"}
      {@const opt = "flex min-h-14 w-full items-center gap-3.5 px-5 text-left"}
      <div class="py-1">
        <button type="button" class={opt} onclick={() => goto(addHref(m))}><Plus class="size-5 text-muted-foreground" />Add food</button>
        <button type="button" class={opt} onclick={() => { menuFor = null; quickNew = m; }}><Zap class="size-5 text-muted-foreground" />Quick add calories</button>
        <div class="my-1 h-px bg-border"></div>
        {#if yest.length}
          <button type="button" class={opt} onclick={() => void copyFrom(addDays(dateIso, -1), m)}>
            <Copy class="size-5 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block">Copy yesterday's {MEAL_LABELS[m].toLowerCase()}</span>
              <span class="block truncate text-xs text-muted-foreground">{yest.map((i) => i.name).join(", ")} · {fmtNum(yest.reduce((n, i) => n + i.computed.kcal, 0))} kcal</span>
            </span>
          </button>
        {/if}
        <button type="button" class={opt} onclick={() => (menuMode = "copyDay")}><CalendarDays class="size-5 text-muted-foreground" />Copy from another day…</button>
        {#if items.length}
          <button type="button" class={opt} onclick={() => (menuMode = "save")}>
            <Bookmark class="size-5 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1"><span class="block">Save as a meal</span><span class="block text-xs text-muted-foreground">Log all {items.length} again in one tap</span></span>
          </button>
          <div class="my-1 h-px bg-border"></div>
          <button type="button" class={opt} onclick={() => (menuMode = "move")}><MoveHorizontal class="size-5 text-muted-foreground" />Move to another meal…</button>
          <button type="button" class="{opt} text-destructive" onclick={() => void clearMeal(m)}><Trash2 class="size-5" />Clear {MEAL_LABELS[m].toLowerCase()}</button>
        {/if}
      </div>
    {:else if menuMode === "copyDay"}
      <div class="flex flex-col gap-3 px-5 py-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Copy {MEAL_LABELS[m].toLowerCase()} from</span>
          <DateField bind:value={copyFromIso} maxIso={localDateIso()} aria-label="Copy from date" />
        </label>
        <button type="button" class="h-12 rounded-xl bg-primary font-semibold text-primary-foreground" onclick={() => void copyFrom(copyFromIso, m)}>Copy</button>
      </div>
    {:else if menuMode === "save"}
      <form class="flex flex-col gap-3 px-5 py-4" onsubmit={(e) => { e.preventDefault(); void saveTemplate(m); }}>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Name</span>
          <input class="h-12 rounded-xl bg-muted px-3 outline-none focus:ring-2 focus:ring-ring" bind:value={templateName} />
        </label>
        <button type="submit" class="h-12 rounded-xl bg-primary font-semibold text-primary-foreground">Save meal</button>
      </form>
    {:else if menuMode === "move"}
      <div class="grid grid-cols-3 gap-2 px-5 py-4">
        {#each MEAL_SLOTS.filter((x) => x !== m) as to (to)}
          <button type="button" class={chip(false)} onclick={() => void moveAll(m, to)}>{MEAL_LABELS[to]}</button>
        {/each}
      </div>
    {/if}
  </BottomSheet>
{/if}
