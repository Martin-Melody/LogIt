<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import type { MyCheckinSchedule } from "@logit/core/data/checkinRepo";
  import { createCoachProgram } from "@logit/core/domain/CoachProgram";
  import { createCheckinSchedule } from "@logit/core/domain/Checkin";
  import {
    createCoachNutritionPlan,
    updateCoachNutritionPlan,
    type CoachNutritionPlan,
  } from "@logit/core/domain/CoachNutritionPlan";
  import { getNutritionInsights } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import type { NutritionInsightsView } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import { dayTotals, localDateIso, type DiaryDay } from "@logit/core/domain/nutrition";
  import { coachApi } from "@logit/core/api/coachApi";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";
  import {
    getWebCoachProgramRepo,
    getWebCheckinRepo,
    getWebCoachNutritionPlanRepo,
    getWebNutritionDeps,
  } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let creating = $state(false);
  let error = $state<string | null>(null);
  let programs = $state<MyCoachProgram[]>([]);
  let checkins = $state<MyCheckinSchedule[]>([]);

  // Nutrition
  let plan = $state<CoachNutritionPlan | null>(null);
  let planSaving = $state(false);
  let planSaved = $state(false);
  let insights = $state<NutritionInsightsView | null>(null);
  let recentDiary = $state<DiaryDay[]>([]);

  // Per-day diary comments (ride on the coach↔client message thread).
  let relationshipId = $state<string | null>(null);
  let commentsByDate = $state<Record<string, RemoteMessage[]>>({});
  let commentDraft = $state<Record<string, string>>({});
  let commentSending = $state<string | null>(null);

  async function loadComments() {
    if (!relationshipId) return;
    try {
      const msgs = await messagesApi.list(relationshipId, 0);
      const byDate: Record<string, RemoteMessage[]> = {};
      for (const m of msgs) {
        if (!m.contextDateIso) continue;
        (byDate[m.contextDateIso] ??= []).push(m);
      }
      commentsByDate = byDate;
    } catch {
      /* best-effort */
    }
  }

  async function sendComment(dateIso: string) {
    const body = (commentDraft[dateIso] ?? "").trim();
    if (!body || !relationshipId || commentSending) return;
    commentSending = dateIso;
    try {
      await messagesApi.send({
        relationshipId,
        messageId: crypto.randomUUID(),
        body,
        createdAtMs: Date.now(),
        contextDateIso: dateIso,
      });
      commentDraft = { ...commentDraft, [dateIso]: "" };
      await loadComments();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to post comment";
    } finally {
      commentSending = null;
    }
  }

  function fmtTime(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [progs, cks, myPlan] = await Promise.all([
        getWebCoachProgramRepo().listMyPrograms({ recipientId: clientId }),
        getWebCheckinRepo().listMySchedules({ recipientId: clientId }),
        getWebCoachNutritionPlanRepo().getForRecipient(clientId),
      ]);
      programs = progs;
      checkins = cks;
      plan = myPlan?.plan ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
    // Client nutrition data — best-effort, don't block the page.
    const nutDeps = getWebNutritionDeps(clientId);
    getNutritionInsights(nutDeps, { rangeDays: 30 })
      .then((v) => (insights = v))
      .catch(() => {});
    const start = new Date(Date.now() - 7 * 86_400_000);
    nutDeps.nutritionRepo
      .listDaysInRange(localDateIso(start), localDateIso())
      .then((d) => (recentDiary = d.slice().reverse()))
      .catch(() => {});
    coachApi
      .listClients()
      .then((cs) => {
        relationshipId = cs.find((c) => c.client.id === clientId)?.relationshipId ?? null;
        return loadComments();
      })
      .catch(() => {});
  }

  function editPlan(patch: Partial<CoachNutritionPlan>) {
    plan = updateCoachNutritionPlan(plan ?? createCoachNutritionPlan(`${username}'s targets`), patch);
    planSaved = false;
  }

  async function savePlan() {
    if (!plan || planSaving || !username) return;
    planSaving = true;
    error = null;
    try {
      await getWebCoachNutritionPlanRepo().savePlan(plan, username);
      planSaved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save plan";
    } finally {
      planSaving = false;
    }
  }

  const metricLabel = (id: string) =>
    insights?.plugin?.metricDefinitions.find((d) => d.id === id)?.label ?? id;
  const metricValue = (id: string) => {
    const m = insights?.output?.metrics.find((x) => x.id === id);
    return m ? (m.formatted ?? String(m.value)) : "—";
  };

  async function newProgram() {
    if (creating || !username) return;
    creating = true;
    error = null;
    try {
      const p = createCoachProgram(`${username}'s program`);
      await getWebCoachProgramRepo().saveProgram(p, username);
      await goto(`/clients/${clientId}/programs/${p.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create program";
      creating = false;
    }
  }

  async function newCheckin() {
    if (creating || !username) return;
    creating = true;
    error = null;
    try {
      const s = createCheckinSchedule("Weekly check-in");
      await getWebCheckinRepo().saveSchedule(s, username);
      await goto(`/clients/${clientId}/checkins/${s.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create check-in";
      creating = false;
    }
  }

  $effect(() => {
    void clientId;
    void load();
  });
</script>

<div class="flex flex-col gap-4 max-w-3xl">
  <div>
    <a href="/clients" class="text-xs text-muted-foreground hover:text-foreground">&larr; Clients</a>
    <h1 class="text-lg font-semibold mt-1">@{username}</h1>
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <Card.Root>
    <Card.Header class="pb-2 flex-row items-start justify-between">
      <div>
        <Card.Title>Programs</Card.Title>
        <Card.Description>Training programs you've assigned to this client.</Card.Description>
      </div>
      <Button size="sm" disabled={creating} onclick={newProgram}>
        {#if creating}<Spinner class="size-4" />{/if}
        New
      </Button>
    </Card.Header>
    <Card.Content class="pt-0 pb-2">
      {#if loading}
        <p class="text-sm text-muted-foreground py-2">Loading…</p>
      {:else if programs.length === 0}
        <p class="text-sm text-muted-foreground py-2">No programs yet.</p>
      {:else}
        {#each programs as { program } (program.id)}
          <a href="/clients/{clientId}/programs/{program.id}?u={username}"
            class="flex items-center justify-between py-2 border-b last:border-0 border-border text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
            <span class="font-medium">{program.name}</span>
            <span class="text-xs text-muted-foreground">{program.weeks.length} week{program.weeks.length === 1 ? "" : "s"}</span>
          </a>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2 flex-row items-start justify-between">
      <div>
        <Card.Title>Check-ins</Card.Title>
        <Card.Description>Recurring questionnaires this client fills in.</Card.Description>
      </div>
      <Button size="sm" variant="outline" disabled={creating} onclick={newCheckin}>New</Button>
    </Card.Header>
    <Card.Content class="pt-0 pb-2">
      {#if loading}
        <p class="text-sm text-muted-foreground py-2">Loading…</p>
      {:else if checkins.length === 0}
        <p class="text-sm text-muted-foreground py-2">No check-ins yet.</p>
      {:else}
        {#each checkins as { schedule } (schedule.id)}
          <a href="/clients/{clientId}/checkins/{schedule.id}?u={username}"
            class="flex items-center justify-between py-2 border-b last:border-0 border-border text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
            <span class="font-medium">{schedule.name}</span>
            <span class="text-xs text-muted-foreground capitalize">{schedule.cadence} · {schedule.questions.length}q</span>
          </a>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title>Nutrition targets</Card.Title>
      <Card.Description>
        A daily calorie/macro target for this client. It shows in their app as “From your coach”
        and overrides their own goal.
      </Card.Description>
    </Card.Header>
    <Card.Content class="pt-0 flex flex-col gap-3">
      {#if loading}
        <p class="text-sm text-muted-foreground py-2">Loading…</p>
      {:else}
        {@const p = plan}
        <div class="grid grid-cols-4 gap-2">
          {#each [["kcal", "Calories", p?.kcalTarget], ["proteinG", "Protein (g)", p?.proteinG], ["carbsG", "Carbs (g)", p?.carbsG], ["fatG", "Fat (g)", p?.fatG]] as [key, label, value] (key)}
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">{label}</span>
              <input
                type="number"
                min="0"
                class="h-8 rounded border border-border bg-background px-2 text-sm"
                value={value ?? ""}
                oninput={(e) =>
                  editPlan({ [key as string]: Number(e.currentTarget.value) || undefined } as Partial<CoachNutritionPlan>)}
              />
            </label>
          {/each}
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Note to the client (optional)</span>
          <textarea
            rows="2"
            class="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={p?.note ?? ""}
            oninput={(e) => editPlan({ note: e.currentTarget.value || undefined })}
          ></textarea>
        </label>
        <div class="flex items-center gap-3">
          <Button size="sm" disabled={planSaving || !plan} onclick={savePlan}>
            {#if planSaving}<Spinner class="size-4" />{/if}
            {planSaved ? "Saved" : plan ? "Save targets" : "Set targets"}
          </Button>
          {#if !plan}
            <span class="text-xs text-muted-foreground">Enter a calorie target to start.</span>
          {:else}
            <a href="/clients/{clientId}/nutrition?u={username}" class="text-xs text-primary hover:underline">
              Edit meal plan{#if plan.meals?.length} ({plan.meals.length}){/if} &rarr;
            </a>
          {/if}
        </div>
      {/if}

      {#if insights?.output}
        <div class="mt-1 border-t border-border pt-3">
          <p class="text-xs text-muted-foreground mb-2">Last 30 days</p>
          <div class="grid grid-cols-3 gap-3 text-sm">
            {#each ["avgKcal30", "adherence", "weightChange", "avgProtein", "weeklyRate"] as id (id)}
              <div>
                <div class="text-xs text-muted-foreground">{metricLabel(id)}</div>
                <div class="font-medium tabular-nums">{metricValue(id)}</div>
              </div>
            {/each}
          </div>
          {#if insights.output.insights?.length}
            <ul class="mt-2 flex flex-col gap-1">
              {#each insights.output.insights as text (text)}
                <li class="text-xs text-muted-foreground">{text}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if recentDiary.length}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Recent diary</Card.Title>
        <Card.Description>What this client logged over the last 7 days.</Card.Description>
      </Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-3">
        {#each recentDiary as d (d.id)}
          <div>
            <div class="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{d.dateIso}</span>
              <span class="tabular-nums">{dayTotals(d).kcal} kcal · P {Math.round(dayTotals(d).proteinG)}</span>
            </div>
            <ul class="flex flex-col gap-1 text-sm">
              {#each d.items as it (it.id)}
                <li class="flex items-center gap-2">
                  {#if it.photoDataUrl}
                    <img src={it.photoDataUrl} alt="" class="h-9 w-9 rounded object-cover shrink-0" />
                  {/if}
                  <span class="flex-1 truncate">{it.name}</span>
                  <span class="text-xs text-muted-foreground tabular-nums">{it.computed.kcal} kcal</span>
                </li>
              {/each}
            </ul>

            {#if commentsByDate[d.dateIso]?.length}
              <ul class="mt-2 flex flex-col gap-1">
                {#each commentsByDate[d.dateIso] as c (c.messageId)}
                  <li class="text-xs rounded bg-muted/60 px-2 py-1">
                    <span class="text-muted-foreground">{c.mine ? "You" : "Client"} · {fmtTime(c.createdAtMs)}</span>
                    <p class="whitespace-pre-wrap break-words">{c.body}</p>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if relationshipId}
              <form
                class="mt-2 flex items-center gap-2"
                onsubmit={(e) => { e.preventDefault(); void sendComment(d.dateIso); }}
              >
                <input
                  type="text"
                  placeholder="Comment on this day…"
                  class="h-7 flex-1 rounded border border-border bg-background px-2 text-xs"
                  value={commentDraft[d.dateIso] ?? ""}
                  oninput={(e) => (commentDraft = { ...commentDraft, [d.dateIso]: e.currentTarget.value })}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={commentSending === d.dateIso || !(commentDraft[d.dateIso] ?? "").trim()}
                >
                  Post
                </Button>
              </form>
            {/if}
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
