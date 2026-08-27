<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import type { CheckinSchedule, CheckinSubmission, CheckinQuestion } from "@logit/core/domain/Checkin";
  import { currentPeriodIndex, createSubmission, setAnswer, markSubmitted } from "@logit/core/domain/Checkin";
  import { getCheckinRepo } from "$lib/data/repoProvider";
  import { saveCheckinSubmission } from "$lib/usecases/checkins/submitCheckin";

  const props = $props<{ params: { scheduleId: string } }>();
  const scheduleId = $derived(props.params.scheduleId);

  const ui = $state({ loading: true, saving: false, error: null as string | null, done: false });
  let schedule = $state<CheckinSchedule | null>(null);
  let submission = $state<CheckinSubmission | null>(null);

  const alreadySubmitted = $derived(!!submission?.submittedAtMs);

  function answerFor(qId: string) {
    return submission?.answers.find((a) => a.questionId === qId);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const repo = getCheckinRepo();
      schedule = await repo.getAssignedSchedule(scheduleId);
      if (!schedule) return;
      const period = currentPeriodIndex(schedule) ?? 0;
      const existing = (await repo.listSubmissions(scheduleId)).find((s) => s.periodIndex === period);
      submission = existing ?? createSubmission(schedule, period);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load check-in";
    } finally {
      ui.loading = false;
    }
  }

  function update(q: CheckinQuestion, value: Parameters<typeof setAnswer>[2]) {
    if (!submission || alreadySubmitted) return;
    submission = setAnswer(submission, q.id, value);
  }

  async function persist(submit: boolean) {
    if (!submission) return;
    ui.saving = true;
    ui.error = null;
    try {
      const next = submit ? markSubmitted(submission) : { ...submission, updatedAtMs: Date.now() };
      await saveCheckinSubmission(next);
      submission = next;
      if (submit) ui.done = true;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  async function handlePhoto(q: CheckinQuestion, e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update(q, { photoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/checkins")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold truncate">{schedule?.name ?? "Check-in"}</p>
      {#if alreadySubmitted}<p class="text-xs text-muted-foreground">Submitted — thanks!</p>{/if}
    </div>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !schedule}
    <p class="px-3 py-4 text-sm text-muted-foreground">Check-in not found.</p>
  {:else if ui.done}
    <p class="px-3 py-8 text-center text-sm text-muted-foreground">Check-in sent to your coach ✓</p>
  {:else}
    <div class="flex flex-col divide-y divide-border">
      {#each schedule.questions as q (q.id)}
        <div class="px-3 py-3">
          <label class="text-sm font-medium" for={q.id}>
            {q.prompt}{#if q.required}<span class="text-destructive"> *</span>{/if}
          </label>
          <div class="mt-1.5">
            {#if q.type === "text"}
              <textarea id={q.id} rows="3" disabled={alreadySubmitted}
                class="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={answerFor(q.id)?.text ?? ""}
                onblur={(e) => update(q, { text: e.currentTarget.value })}></textarea>
            {:else if q.type === "number" || q.type === "weight"}
              <input id={q.id} type="number" inputmode="decimal" disabled={alreadySubmitted}
                class="w-32 rounded border bg-background px-2 py-1.5 text-sm"
                value={answerFor(q.id)?.number ?? ""}
                onblur={(e) => update(q, { number: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })} />
              {#if q.type === "weight"}<span class="ml-1 text-xs text-muted-foreground">kg</span>{/if}
            {:else if q.type === "scale"}
              {@const min = q.scaleMin ?? 1}
              {@const max = q.scaleMax ?? 10}
              <div class="flex flex-wrap gap-1">
                {#each Array.from({ length: max - min + 1 }, (_, i) => min + i) as n}
                  <button type="button" disabled={alreadySubmitted}
                    class="h-8 w-8 rounded border text-sm {answerFor(q.id)?.number === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'}"
                    onclick={() => update(q, { number: n })}>{n}</button>
                {/each}
              </div>
            {:else if q.type === "boolean"}
              <div class="flex gap-2">
                {#each [{ v: true, l: "Yes" }, { v: false, l: "No" }] as opt}
                  <button type="button" disabled={alreadySubmitted}
                    class="px-3 py-1.5 rounded border text-sm {answerFor(q.id)?.bool === opt.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'}"
                    onclick={() => update(q, { bool: opt.v })}>{opt.l}</button>
                {/each}
              </div>
            {:else if q.type === "photo"}
              {#if answerFor(q.id)?.photoDataUrl}
                <img src={answerFor(q.id)?.photoDataUrl} alt="check-in" class="max-h-40 rounded border border-border" />
              {/if}
              {#if !alreadySubmitted}
                <input type="file" accept="image/*" class="mt-1 text-xs" onchange={(e) => handlePhoto(q, e)} />
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if !alreadySubmitted}
      <div class="flex gap-2 px-3 py-3">
        <Button variant="outline" size="sm" disabled={ui.saving} onclick={() => void persist(false)}>Save draft</Button>
        <Button size="sm" disabled={ui.saving} onclick={() => void persist(true)}>Submit to coach</Button>
      </div>
    {/if}
  {/if}
</div>
