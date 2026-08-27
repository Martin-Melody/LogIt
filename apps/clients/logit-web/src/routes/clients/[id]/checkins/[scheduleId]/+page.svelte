<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import type { CheckinSchedule, CheckinCadence, CheckinQuestionType, CheckinSubmission } from "@logit/core/domain/Checkin";
  import * as C from "@logit/core/domain/Checkin";
  import { getWebCheckinRepo, fetchClientCheckinSubmissions } from "$lib/deps";

  const clientId = $derived(page.params.id!);
  const scheduleId = $derived(page.params.scheduleId!);
  const username = $derived(page.url.searchParams.get("u") ?? "");

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let schedule = $state<CheckinSchedule | null>(null);
  let submissions = $state<CheckinSubmission[]>([]);

  const cadences: CheckinCadence[] = ["weekly", "biweekly", "monthly", "manual"];
  const qTypes: { v: CheckinQuestionType; l: string }[] = [
    { v: "text", l: "Text" }, { v: "number", l: "Number" }, { v: "scale", l: "Scale 1–10" },
    { v: "weight", l: "Bodyweight" }, { v: "boolean", l: "Yes / No" }, { v: "photo", l: "Photo" },
  ];

  async function load() {
    loading = true;
    error = null;
    try {
      const [row, subs] = await Promise.all([
        getWebCheckinRepo().getMySchedule(scheduleId),
        fetchClientCheckinSubmissions(clientId).catch(() => [] as CheckinSubmission[]),
      ]);
      schedule = row?.schedule ?? null;
      submissions = subs
        .filter((s) => s.scheduleId === scheduleId)
        .sort((a, b) => b.periodIndex - a.periodIndex);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function run(fn: (s: CheckinSchedule) => CheckinSchedule) {
    if (!schedule) return;
    const next = C.touchCheckinSchedule(fn(schedule));
    schedule = next;
    saving = true;
    error = null;
    try {
      await getWebCheckinRepo().saveSchedule(next, username || undefined);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  async function removeSchedule() {
    if (!confirm("Delete this check-in? This removes it for the client too.")) return;
    await getWebCheckinRepo().deleteSchedule(scheduleId);
    await goto(`/clients/${clientId}?u=${username}`);
  }

  function promptFor(qId: string): string {
    return schedule?.questions.find((q) => q.id === qId)?.prompt ?? qId;
  }
  function answerText(sub: CheckinSubmission, qId: string): string {
    const a = sub.answers.find((x) => x.questionId === qId);
    if (!a) return "—";
    if (a.text) return a.text;
    if (a.number != null) return String(a.number);
    if (a.bool != null) return a.bool ? "Yes" : "No";
    if (a.photoDataUrl) return "[photo]";
    return "—";
  }
  function fmt(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  $effect(() => {
    void scheduleId;
    void load();
  });
</script>

<div class="flex flex-col gap-4 max-w-3xl">
  <div class="flex items-center justify-between">
    <a href="/clients/{clientId}?u={username}" class="text-xs text-muted-foreground hover:text-foreground">&larr; @{username}</a>
    {#if schedule}
      <Button size="sm" variant="outline" class="text-destructive" onclick={removeSchedule}>Delete</Button>
    {/if}
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else if !schedule}
    <p class="text-sm text-muted-foreground">Check-in not found.</p>
  {:else}
    <Card.Root>
      <Card.Header class="pb-2">
        <div class="flex items-center gap-3">
          <input
            class="text-lg font-semibold bg-transparent border-b border-transparent focus:border-primary focus:outline-none flex-1"
            value={schedule.name}
            onblur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== schedule?.name) void run((s) => C.renameCheckinSchedule(s, v)); }}
          />
          <span class="text-xs text-muted-foreground">{saving ? "saving…" : "saved"}</span>
        </div>
      </Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-3">
        <label class="text-sm flex items-center gap-2">
          <span class="text-muted-foreground">Cadence</span>
          <select value={schedule.cadence} class="rounded border bg-background px-2 py-1 text-sm capitalize"
            onchange={(e) => void run((s) => C.setCadence(s, e.currentTarget.value as CheckinCadence))}>
            {#each cadences as c}<option value={c}>{c}</option>{/each}
          </select>
        </label>

        <div class="flex flex-col divide-y divide-border border-y border-border">
          {#each schedule.questions as q (q.id)}
            <div class="py-2 flex flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <input class="flex-1 text-sm bg-transparent border-b border-transparent focus:border-primary focus:outline-none"
                  value={q.prompt}
                  onblur={(e) => { const v = e.currentTarget.value.trim(); if (v !== q.prompt) void run((s) => C.updateQuestion(s, q.id, { prompt: v })); }} />
                <button type="button" class="text-xs text-muted-foreground hover:text-destructive"
                  onclick={() => void run((s) => C.removeQuestion(s, q.id))}>Remove</button>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <select value={q.type} class="rounded border bg-background px-1.5 py-0.5"
                  onchange={(e) => void run((s) => C.updateQuestion(s, q.id, { type: e.currentTarget.value as CheckinQuestionType }))}>
                  {#each qTypes as t}<option value={t.v}>{t.l}</option>{/each}
                </select>
                <label class="flex items-center gap-1 text-muted-foreground">
                  <input type="checkbox" checked={q.required ?? false}
                    onchange={(e) => void run((s) => C.updateQuestion(s, q.id, { required: e.currentTarget.checked }))} />
                  Required
                </label>
              </div>
            </div>
          {/each}
        </div>
        <button type="button" class="text-sm text-primary hover:underline self-start" onclick={() => void run((s) => C.addQuestion(s))}>
          + Add question
        </button>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Responses</Card.Title>
        <Card.Description>{submissions.length} submitted</Card.Description>
      </Card.Header>
      <Card.Content class="pt-0 pb-3">
        {#if submissions.length === 0}
          <p class="text-sm text-muted-foreground py-2">No responses yet.</p>
        {:else}
          <div class="flex flex-col gap-3">
            {#each submissions as sub (sub.id)}
              <div class="rounded border border-border p-3">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-medium">Week of {fmt(sub.periodStartMs)}</span>
                  {#if sub.submittedAtMs}
                    <Badge variant="secondary" class="text-xs px-1.5 py-0">Submitted {fmt(sub.submittedAtMs)}</Badge>
                  {:else}
                    <Badge variant="outline" class="text-xs px-1.5 py-0">Draft</Badge>
                  {/if}
                </div>
                <dl class="grid gap-1 text-sm">
                  {#each schedule.questions as q (q.id)}
                    <div class="flex gap-2">
                      <dt class="text-muted-foreground min-w-40">{promptFor(q.id)}</dt>
                      <dd>
                        {#if sub.answers.find((a) => a.questionId === q.id)?.photoDataUrl}
                          <img src={sub.answers.find((a) => a.questionId === q.id)?.photoDataUrl} alt="check-in" class="max-h-40 rounded border border-border" />
                        {:else}
                          {answerText(sub, q.id)}
                        {/if}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
