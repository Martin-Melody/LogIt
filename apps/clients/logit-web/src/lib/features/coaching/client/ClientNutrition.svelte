<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    createCoachNutritionPlan,
    updateCoachNutritionPlan,
    type CoachNutritionPlan,
  } from "@logit/core/domain/CoachNutritionPlan";
  import { getNutritionInsights, type NutritionInsightsView } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import { dayTotals, localDateIso, type DiaryDay } from "@logit/core/domain/nutrition";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import type { Sharing } from "@logit/core/api/coachApi";
  import { getWebCoachNutritionPlanRepo, getWebNutritionDeps } from "$lib/deps";
  import NotShared from "./NotShared.svelte";
  import { shortDate } from "../format";

  let { clientId, username, name, relationshipId, sharing }: {
    clientId: string; username: string; name: string; relationshipId: string; sharing: Sharing;
  } = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let plan = $state<CoachNutritionPlan | null>(null);
  let planSaving = $state(false);
  let planSaved = $state(false);
  let insights = $state<NutritionInsightsView | null>(null);
  let recentDiary = $state<DiaryDay[]>([]);
  let commentsByDate = $state<Record<string, RemoteMessage[]>>({});
  let commentDraft = $state<Record<string, string>>({});
  let commentSending = $state<string | null>(null);

  async function loadComments() {
    try {
      const msgs = (await messagesApi.list(relationshipId, 0)).sort((a, b) => a.createdAtMs - b.createdAtMs);
      const byDate: Record<string, RemoteMessage[]> = {};
      for (const m of msgs) if (m.contextDateIso) (byDate[m.contextDateIso] ??= []).push(m);
      commentsByDate = byDate;
    } catch {
      /* best-effort */
    }
  }

  onMount(async () => {
    try {
      plan = (await getWebCoachNutritionPlanRepo().getForRecipient(clientId))?.plan ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load nutrition targets";
    } finally {
      loading = false;
    }
    if (!sharing.nutrition) return;
    const deps = getWebNutritionDeps(clientId);
    getNutritionInsights(deps, { rangeDays: 30 }).then((v) => (insights = v)).catch(() => {});
    const start = new Date(Date.now() - 7 * 86_400_000);
    deps.nutritionRepo.listDaysInRange(localDateIso(start), localDateIso())
      .then((d) => (recentDiary = d.slice().reverse()))
      .catch(() => {});
    void loadComments();
  });

  function editPlan(patch: Partial<CoachNutritionPlan>) {
    plan = updateCoachNutritionPlan(plan ?? createCoachNutritionPlan(`${username}'s targets`), patch);
    planSaved = false;
  }

  async function savePlan() {
    if (!plan || planSaving) return;
    planSaving = true;
    error = null;
    try {
      await getWebCoachNutritionPlanRepo().savePlan(plan, username);
      planSaved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the targets";
    } finally {
      planSaving = false;
    }
  }

  async function sendComment(dateIso: string) {
    const body = (commentDraft[dateIso] ?? "").trim();
    if (!body || commentSending) return;
    commentSending = dateIso;
    try {
      await messagesApi.send({ relationshipId, messageId: createId("msg"), body, createdAtMs: Date.now(), contextDateIso: dateIso });
      commentDraft = { ...commentDraft, [dateIso]: "" };
      await loadComments();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't post the comment";
    } finally {
      commentSending = null;
    }
  }

  const metricLabel = (id: string) => insights?.plugin?.metricDefinitions.find((d) => d.id === id)?.label ?? id;
  const metricValue = (id: string) => {
    const m = insights?.output?.metrics.find((x) => x.id === id);
    return m ? (m.formatted ?? String(m.value)) : "–";
  };
</script>

<div class="flex flex-col gap-4">
  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
    <div>
      <h2 class="text-sm font-semibold">Nutrition targets</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">Shown in {name}'s app as "From your coach", in place of their own goal.</p>
    </div>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else}
      {@const p = plan}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each [["kcalTarget", "Calories", p?.kcalTarget], ["proteinG", "Protein (g)", p?.proteinG], ["carbsG", "Carbs (g)", p?.carbsG], ["fatG", "Fat (g)", p?.fatG]] as [key, label, value] (key)}
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{label}</span>
            <input type="number" min="0" class="h-9 rounded-lg border border-input bg-background px-2 text-sm" value={value ?? ""}
              oninput={(e) => editPlan({ [key as string]: Number(e.currentTarget.value) || undefined } as Partial<CoachNutritionPlan>)} />
          </label>
        {/each}
      </div>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Note to {name} (optional)</span>
        <textarea rows="2" class="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" value={p?.note ?? ""}
          oninput={(e) => editPlan({ note: e.currentTarget.value || undefined })}></textarea>
      </label>
      <div class="flex items-center gap-3">
        <Button size="sm" disabled={planSaving || !plan} onclick={savePlan}>
          {#if planSaving}<Spinner class="size-4" />{/if}
          {planSaved ? "Saved" : plan ? "Save targets" : "Set targets"}
        </Button>
        {#if plan}
          <a href="/clients/{clientId}/nutrition?u={username}" class="text-xs text-primary hover:underline">Edit meal plan{plan.meals?.length ? ` (${plan.meals.length})` : ""} ›</a>
        {:else}
          <span class="text-xs text-muted-foreground">Enter a calorie target to start.</span>
        {/if}
      </div>
    {/if}
  </section>

  {#if !sharing.nutrition}
    <NotShared {name} what="their nutrition diary" note="You can still set targets for them above." />
  {:else}
    {#if insights?.output}
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">Last 30 days</h2>
        <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {#each ["avgKcal30", "adherence", "weightChange", "avgProtein", "weeklyRate"] as id (id)}
            <div><div class="text-xs text-muted-foreground">{metricLabel(id)}</div><div class="font-medium tabular-nums">{metricValue(id)}</div></div>
          {/each}
        </div>
        {#if insights.output.insights?.length}
          <ul class="flex flex-col gap-1">{#each insights.output.insights as text (text)}<li class="text-xs text-muted-foreground">{text}</li>{/each}</ul>
        {/if}
      </section>
    {/if}

    <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div>
        <h2 class="text-sm font-semibold">Diary, last 7 days</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">A comment on a day goes to your messages with {name} and shows on that day in their app.</p>
      </div>
      {#each recentDiary as d (d.id)}
        {@const t = dayTotals(d)}
        <div class="border-t border-border pt-3">
          <div class="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{new Date(d.dateIso + "T12:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
            <span class="tabular-nums">{t.kcal} kcal · P {Math.round(t.proteinG)} g</span>
          </div>
          <ul class="flex flex-col gap-1 text-sm">
            {#each d.items as it (it.id)}
              <li class="flex items-center gap-2">
                {#if it.photoDataUrl}<img src={it.photoDataUrl} alt="" class="size-9 shrink-0 rounded object-cover" />{/if}
                <span class="flex-1 truncate">{it.name}</span>
                <span class="text-xs tabular-nums text-muted-foreground">{it.computed.kcal} kcal</span>
              </li>
            {/each}
          </ul>
          {#each commentsByDate[d.dateIso] ?? [] as c (c.messageId)}
            <p class="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs"><span class="text-muted-foreground">{c.mine ? "You" : name} · {shortDate(c.createdAtMs)}</span><br />{c.body}</p>
          {/each}
          <form class="mt-2 flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void sendComment(d.dateIso); }}>
            <label class="sr-only" for="comment-{d.dateIso}">Comment on this day</label>
            <input id="comment-{d.dateIso}" type="text" placeholder="Comment on this day…" class="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-xs"
              value={commentDraft[d.dateIso] ?? ""} oninput={(e) => (commentDraft = { ...commentDraft, [d.dateIso]: e.currentTarget.value })} />
            <Button type="submit" size="sm" variant="outline" disabled={commentSending === d.dateIso || !(commentDraft[d.dateIso] ?? "").trim()}>Post</Button>
          </form>
        </div>
      {:else}
        <p class="border-t border-border pt-3 text-[13px] text-muted-foreground">Nothing logged in the last 7 days.</p>
      {/each}
    </section>
  {/if}
</div>
