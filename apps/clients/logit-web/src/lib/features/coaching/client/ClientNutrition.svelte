<!-- Canvas MP6: a client's Nutrition tab. Their meal plan (their copy, since when, what it works
     out to), the last 7 days against each day's own target (training or rest day, the plan that
     applied then), with a comment on any day, and their weight against their goal pace. Without
     a shared diary: the plan card and their targets only. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { createId } from "@logit/core/domain/ids";
  import { planDay, planFromIso, planOn, allMeals, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { dayTotals, localDateIso, type DiaryDay } from "@logit/core/domain/nutrition";
  import { isTrainingDay } from "@logit/core/domain/trainingDay";
  import { dayAgainstPlan } from "@logit/core/domain/mealPlanDay";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getNutritionTargets, type ResolvedTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { getWebDeps, getWebCoachProgramRepo, getWebNutritionDeps } from "$lib/deps";
  import GiveMealPlanDialog from "../nutrition/GiveMealPlanDialog.svelte";
  import SuggestGoalDialog from "../nutrition/SuggestGoalDialog.svelte";
  let suggesting = $state(false);
  import { clientNutritionContext, targetsLine, type ClientNutritionContext } from "../nutrition/clientNutrition";
  import NotShared from "./NotShared.svelte";
  import { shortDate } from "../format";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";

  let { clientId, username, name, relationshipId, sharing }: {
    clientId: string; username: string; name: string; relationshipId: string; sharing: Sharing;
  } = $props();

  const first = $derived(name.split(" ")[0] || name);
  let ctx = $state<ClientNutritionContext | null>(null);
  let line = $state("");
  let ownTargets = $state<ResolvedTargets | null>(null);
  let days = $state<DiaryDay[]>([]);
  let sessions = $state<WorkoutSession[]>([]);
  let programs = $state<CoachProgram[]>([]);
  let comments = $state<Record<string, RemoteMessage[]>>({});
  let loaded = $state(false);
  // svelte-ignore state_referenced_locally
  let giving = $state(page.url.searchParams.get("give") === "1");

  async function load() {
    ctx = await clientNutritionContext(clientId, sharing);
    line = ctx.current ? (await targetsLine(clientId, ctx.current).catch(() => ({ text: "" }))).text : "";
    if (!ctx.current && sharing.nutrition) {
      // No plan from you: what their own app sets.
      const deps = getWebNutritionDeps(clientId);
      ownTargets = (await getNutritionTargets({ nutritionRepo: deps.nutritionRepo, nutritionAlgorithmRegistry: deps.nutritionAlgorithmRegistry }).catch(() => null))?.targets ?? null;
    }
    loaded = true;
    if (!sharing.nutrition) return;
    const deps = getWebNutritionDeps(clientId);
    const start = new Date(Date.now() - 6 * 86_400_000);
    const [d, s, p] = await Promise.all([
      deps.nutritionRepo.listDaysInRange(localDateIso(start), localDateIso()).catch(() => []),
      sharing.workouts ? getWebDeps(clientId).workoutRepo.listAllSessions().catch(() => []) : Promise.resolve([]),
      getWebCoachProgramRepo().listMyPrograms({ recipientId: clientId }).catch(() => []),
    ]);
    days = d;
    sessions = s;
    programs = p.map((x) => x.program);
    void loadComments();
  }
  async function loadComments() {
    try {
      const msgs = (await messagesApi.list(relationshipId, 0)).sort((a, b) => a.createdAtMs - b.createdAtMs);
      const by: Record<string, RemoteMessage[]> = {};
      for (const m of msgs) if (m.contextDateIso) (by[m.contextDateIso] ??= []).push(m);
      comments = by;
    } catch { /* best-effort */ }
  }
  onMount(load);

  // The last 7 days, newest first, each against the target that applied then.
  const week = $derived.by(() => {
    if (!ctx) return [];
    const out: { iso: string; label: string; kind: string | null; day: DiaryDay | null; target: number | null; protein: number; kcal: number; logged: string | null }[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const iso = localDateIso(dt);
      const plan = planOn(ctx.plans, iso);
      const training = isTrainingDay(iso, programs, sessions);
      const pd = plan ? planDay(plan, iso, training) : null;
      const day = days.find((x) => x.dateIso === iso && !x.deletedAtMs) ?? null;
      const t = day ? dayTotals(day) : null;
      out.push({
        iso,
        label: dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        kind: plan?.mode === "training-rest" ? (training ? "training" : "rest") : plan?.mode === "own" && pd ? pd.name.toLowerCase() : null,
        day,
        target: pd?.kcalTarget ?? null,
        kcal: Math.round(t?.kcal ?? 0),
        protein: Math.round(t?.proteinG ?? 0),
        logged: pd && day && plan ? mealsLogged(plan, pd.meals, day) : null,
      });
    }
    return out;
  });
  /** "4 of 5 · swapped dinner": from what they logged off the plan on their phone (canvas MP6,
   * SW2); for days logged before that, by the foods' names. */
  function mealsLogged(plan: CoachNutritionPlan, meals: CoachNutritionPlan["meals"] & {}, day: DiaryDay): string | null {
    const planned = meals.filter((m) => m.foods.length);
    if (!planned.length) return null;
    if (day.items.some((i) => i.plan?.planId === plan.id)) {
      const a = dayAgainstPlan(day, plan, meals);
      return [`${a.logged} of ${a.of}`, ...(a.swapped.length ? [`swapped ${a.swapped.join(", ")}`] : []), ...(a.changed ? ["changed amounts"] : []), ...(a.offPlan ? [`${a.offPlan} off plan`] : [])].join(" · ");
    }
    const names = new Set(day.items.map((i) => i.name.trim().toLowerCase()));
    const n = planned.filter((m) => m.foods.some((f) => names.has(f.name.trim().toLowerCase()) || f.swaps?.some((s) => names.has(s.name.trim().toLowerCase())))).length;
    return `${n} of ${planned.length}`;
  }
  let openDay = $state<string | null>(null);
  let commenting = $state<string | null>(null);
  let draft = $state("");
  let sending = $state(false);
  async function sendComment(iso: string) {
    const body = draft.trim();
    if (!body || sending) return;
    sending = true;
    try {
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body, createdAtMs: Date.now(), contextDateIso: iso });
      draft = "";
      commenting = null;
      await loadComments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post the comment");
    } finally {
      sending = false;
    }
  }
  const sinceText = (p: CoachNutritionPlan) => new Date(`${planFromIso(p)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const pace = $derived.by(() => {
    const g = ctx?.goal;
    if (!g || g.goalType === "maintain") return g ? "Keep their weight steady" : null;
    return `${g.goalType === "lose" ? "−" : "+"}${g.targetRateKgPerWeek} kg a week`;
  });
</script>

<div class="flex flex-col gap-4">
  {#if !loaded}
    <Skeleton class="h-32" />
  {:else if ctx}
    <section class="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-border bg-card px-[18px] py-4" aria-label="Meal plan">
      {#if ctx.current}
        <div class="min-w-0">
          <h2 class="text-[17px] font-bold">{ctx.current.name}</h2>
          <p class="text-xs text-muted-foreground">Their copy · since {sinceText(ctx.current)}{line ? ` · ${ctx.current.kcalMode === "adaptive" ? "Adaptive targets: " : ""}${line}` : ""}{allMeals(ctx.current).length ? "" : " · targets only"}</p>
        </div>
        <span class="flex gap-1.5">
          <Button variant="outline" size="sm" href="/clients/{clientId}/nutrition?u={username}">Edit their copy</Button>
          <Button variant="outline" size="sm" onclick={() => (giving = true)}>Change plan</Button>
        </span>
      {:else}
        <div class="min-w-0">
          <h2 class="text-[17px] font-bold">No meal plan</h2>
          <p class="text-xs text-muted-foreground">{ownTargets ? `${first} logs against their own app targets: ${ownTargets.kcal.toLocaleString("en-GB")} kcal, ${Math.round(ownTargets.macros.proteinG)} g protein (${ownTargets.sourceLabel}).` : `${first} logs against their own targets, if they've set any.`}</p>
        </div>
        <Button size="sm" onclick={() => (giving = true)}>Give a meal plan…</Button>
      {/if}
    </section>

    {#if !sharing.nutrition}
      <NotShared {name} what="their food diary" note="The plan still works on their phone; you just won't see how it's going." />
    {:else}
      <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Last 7 days">
        <h2 class="px-[18px] pb-2 pt-4 text-sm font-semibold">Last 7 days</h2>
        <div class="grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)_5rem_minmax(6rem,1fr)_auto] gap-x-3 border-t border-border px-[18px] py-2 text-[11px] font-medium text-muted-foreground">
          <span>Day</span><span>Calories</span><span>Protein</span><span>Plan meals logged</span><span></span>
        </div>
        {#each week as d (d.iso)}
          {@const over = d.target && d.kcal > d.target * 1.1}
          <div class="border-t border-border">
            <div class="grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)_5rem_minmax(6rem,1fr)_auto] items-center gap-x-3 px-[18px] py-2 text-[13px]">
              <button type="button" class="flex items-center gap-1.5 text-left font-medium" aria-expanded={openDay === d.iso} disabled={!d.day} onclick={() => (openDay = openDay === d.iso ? null : d.iso)}>
                {#if d.day}<ChevronDownIcon class="size-3.5 transition-transform {openDay === d.iso ? 'rotate-180' : ''}" />{/if}{d.label}{#if d.kind}<span class="font-normal text-muted-foreground">{d.kind}</span>{/if}
              </button>
              {#if d.day}
                <span class="tabular-nums {over ? 'text-warning' : ''}">{d.kcal.toLocaleString("en-GB")}{d.target ? ` of ${d.target.toLocaleString("en-GB")}` : ""}</span>
                <span class="tabular-nums">{d.protein} g</span>
                <span class="text-muted-foreground">{d.logged ?? "–"}</span>
              {:else}
                <span class="col-span-3 text-muted-foreground">Nothing logged</span>
              {/if}
              <Button variant="ghost" size="sm" onclick={() => { commenting = commenting === d.iso ? null : d.iso; draft = ""; }}>Comment{(comments[d.iso] ?? []).length ? ` (${comments[d.iso]!.length})` : ""}</Button>
            </div>
            {#if openDay === d.iso && d.day}
              <ul class="flex flex-col gap-1 px-[18px] pb-3 text-[13px]">
                {#each d.day.items as it (it.id)}
                  <li class="flex items-center gap-2">
                    {#if it.photoDataUrl}<img src={it.photoDataUrl} alt="" class="size-8 shrink-0 rounded object-cover" />{/if}
                    <span class="flex-1 truncate">{it.name}</span>
                    <span class="text-xs tabular-nums text-muted-foreground">{Math.round(it.computed.kcal)} kcal</span>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if commenting === d.iso}
              <div class="flex flex-col gap-2 px-[18px] pb-3">
                {#each comments[d.iso] ?? [] as c (c.messageId)}
                  <p class="rounded-lg bg-muted px-2.5 py-1.5 text-xs"><span class="text-muted-foreground">{c.mine ? "You" : first} · {shortDate(c.createdAtMs)}</span><br />{c.body}</p>
                {/each}
                <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void sendComment(d.iso); }}>
                  <!-- svelte-ignore a11y_autofocus -->
                  <input autofocus bind:value={draft} aria-label="Comment on {d.label}" placeholder="Comment on this day…" class="h-8 flex-1 rounded-[7px] border border-input bg-background px-2 text-[13px]" />
                  <Button type="submit" size="sm" disabled={sending || !draft.trim()}>Post</Button>
                </form>
                <p class="text-xs text-muted-foreground">Goes to your messages with {first} and shows on that day in their app.</p>
              </div>
            {/if}
          </div>
        {/each}
      </section>

      <section class="flex flex-col gap-1.5 rounded-[12px] border border-border bg-card px-[18px] py-4 text-[13px]" aria-label="Targets and weight">
        <h2 class="text-sm font-semibold">Targets and weight</h2>
        <p>Weight, 7-day average: {ctx.weightKg != null ? `${ctx.weightKg.toFixed(1)} kg` : "not enough weigh-ins yet"}{ctx.weightKg != null && ctx.weeklyRateKg != null ? ` · ${ctx.weeklyRateKg > 0 ? "+" : ""}${ctx.weeklyRateKg.toFixed(1)} a week` : ""}</p>
        {#if pace}<p>Goal pace: {pace} <span class="text-muted-foreground">(their goal, set by {first})</span></p>{/if}
        {#if ctx.current?.kcalMode === "adaptive"}<p class="text-muted-foreground">Adaptive targets follow their weight and food trend toward that pace.{ctx.current.proteinG ? ` Protein is set: ${ctx.current.proteinG} g.` : ""}</p>{/if}
        <span class="mt-1 flex flex-wrap gap-1.5">
          {#if ctx.current}<Button variant="outline" size="sm" href="/clients/{clientId}/nutrition?u={username}">Change how targets are set</Button>{/if}
          {#if ctx.goal}<Button variant="outline" size="sm" onclick={() => (suggesting = true)}>Suggest a goal change…</Button>{/if}
        </span>
        {#if ctx.goal}<p class="text-xs text-muted-foreground">Goals are {first}'s; targets and programs are yours. Adaptive targets aim at their goal pace, so if the pace looks wrong, suggest a change rather than fight it with targets.</p>{/if}
      </section>
    {/if}
  {/if}
</div>

<GiveMealPlanDialog bind:open={giving} clientIds={[clientId]} ongiven={() => void load()} />
{#if ctx?.goal}<SuggestGoalDialog bind:open={suggesting} goal={ctx.goal} currentKg={ctx.weightKg} {relationshipId} name={first} />{/if}
