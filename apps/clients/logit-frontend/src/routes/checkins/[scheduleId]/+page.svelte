<script lang="ts">
  import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { chip, segment, segmentTrack } from "$lib/components/ui/choice";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import type { CheckinSchedule, CheckinSubmission, CheckinQuestion } from "@logit/core/domain/Checkin";
  import { currentPeriodIndex, createSubmission, setAnswer, markSubmitted, missedCheckin, missingAnswers } from "@logit/core/domain/Checkin";
  import { page } from "$app/state";
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
      const subs = await repo.listSubmissions(scheduleId);
      // The period the list row was for; else a missed one first (the one the coach is
      // waiting for), else this one.
      const asked = Number(page.url.searchParams.get("period"));
      const period = page.url.searchParams.has("period") && Number.isInteger(asked) && asked >= 0
        ? asked
        : missedCheckin(schedule, subs)?.periodIndex ?? currentPeriodIndex(schedule) ?? 0;
      const existing = subs.find((s) => s.periodIndex === period);
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

  let missing = $state<string[]>([]);

  async function persist(submit: boolean) {
    if (!submission || !schedule) return;
    if (submit) {
      missing = missingAnswers(schedule, submission).map((q) => q.id);
      if (missing.length) {
        ui.error = "Answer the questions marked *.";
        document.getElementById(missing[0]!)?.scrollIntoView({ block: "center" });
        return;
      }
    }
    ui.saving = true;
    ui.error = null;
    try {
      // Sent with the questions as they are now (the coach may change the form later).
      const next = submit ? markSubmitted(submission, schedule) : { ...submission, updatedAtMs: Date.now() };
      await saveCheckinSubmission(next);
      submission = next;
      if (submit) ui.done = true;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  // Resized like every other photo (it used to send the camera's full-size file); never cropped,
  // the coach needs the whole picture.
  async function handlePhoto(q: CheckinQuestion) {
    const chosen = await choosePhoto({ title: "Check-in photo", maxPx: 2048, canRemove: !!answerFor(q.id)?.photoDataUrl });
    if (chosen) update(q, { photoDataUrl: "photo" in chosen ? chosen.photo : undefined });
  }

  // Progress photos: one per pose (front, side, back).
  async function handlePose(q: CheckinQuestion, index: number) {
    const now = answerFor(q.id)?.photoDataUrls ?? q.poses!.map(() => "");
    const chosen = await choosePhoto({ title: `${q.poses![index]} photo`, maxPx: 2048, canRemove: !!now[index] });
    if (!chosen) return;
    const list = [...now];
    list[index] = "photo" in chosen ? chosen.photo : "";
    update(q, { photoDataUrls: list.some(Boolean) ? list : undefined });
  }

  function toggleChoice(q: CheckinQuestion, o: string) {
    const now = new Set(answerFor(q.id)?.choices ?? []);
    if (now.has(o)) now.delete(o);
    else now.add(o);
    const list = (q.options ?? []).filter((x) => now.has(x));
    update(q, { choices: list.length ? list : undefined });
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/checkins")} />
    <div class="min-w-0 flex-1">
      <p class="text-base font-semibold truncate">{schedule?.name ?? "Check-in"}</p>
      {#if alreadySubmitted}<p class="text-xs text-muted-foreground">Submitted — thanks!</p>{/if}
    </div>
  </PageHeader>

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
        <div class="px-3 py-3 {missing.includes(q.id) ? 'bg-destructive/5' : ''}">
          {#if q.type === "heading"}
            <p class="text-base font-semibold">{q.prompt}</p>
            {#if q.help}<p class="mt-0.5 text-sm text-muted-foreground">{q.help}</p>{/if}
          {:else}
          <label class="text-sm font-medium" for={q.id}>
            {q.prompt}{#if q.required}<span class="text-destructive"> *</span>{/if}
          </label>
          {#if q.help}<p class="text-xs text-muted-foreground">{q.help}</p>{/if}
          <div class="mt-1.5">
            {#if q.type === "text" && !q.long}
              <input id={q.id} disabled={alreadySubmitted} class="h-11 w-full rounded-md border bg-background px-2 text-sm"
                value={answerFor(q.id)?.text ?? ""} onblur={(e) => update(q, { text: e.currentTarget.value })} />
            {:else if q.type === "text"}
              <textarea id={q.id} rows="3" disabled={alreadySubmitted}
                class="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={answerFor(q.id)?.text ?? ""}
                onblur={(e) => update(q, { text: e.currentTarget.value })}></textarea>
            {:else if q.type === "number" || q.type === "weight" || q.type === "measurement"}
              <input id={q.id} type="number" inputmode="decimal" disabled={alreadySubmitted}
                class="h-10 w-32 rounded-md border bg-background px-2 text-sm"
                value={answerFor(q.id)?.number ?? ""}
                onblur={(e) => update(q, { number: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })} />
              {#if q.type === "weight"}<span class="ml-1 text-xs text-muted-foreground">kg</span>{:else if q.type === "measurement"}<span class="ml-1 text-xs text-muted-foreground">cm</span>{/if}
            {:else if q.type === "choice" && q.multi}
              <div class="flex flex-wrap gap-2" role="group" aria-label={q.prompt}>
                {#each q.options ?? [] as o (o)}
                  {@const on = answerFor(q.id)?.choices?.includes(o) ?? false}
                  <button type="button" role="checkbox" aria-checked={on} disabled={alreadySubmitted} class={chip(on)} onclick={() => toggleChoice(q, o)}>{o}</button>
                {/each}
              </div>
            {:else if q.type === "choice"}
              <div class="flex flex-wrap gap-2" role="radiogroup" aria-label={q.prompt}>
                {#each q.options ?? [] as o (o)}
                  <button type="button" role="radio" aria-checked={answerFor(q.id)?.text === o} disabled={alreadySubmitted} class={chip(answerFor(q.id)?.text === o)} onclick={() => update(q, { text: o })}>{o}</button>
                {/each}
              </div>
            {:else if q.type === "photo" && q.poses?.length}
              <div class="grid grid-cols-3 gap-2">
                {#each q.poses as pose, k (pose)}
                  {@const url = answerFor(q.id)?.photoDataUrls?.[k]}
                  <button type="button" disabled={alreadySubmitted} onclick={() => void handlePose(q, k)} aria-label="{url ? 'Change' : 'Add'} {pose} photo"
                    class="flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-border text-sm text-muted-foreground">
                    {#if url}<img src={url} alt="{pose} photo" class="size-full object-cover" />{:else}{pose}<span class="text-xs">Add</span>{/if}
                  </button>
                {/each}
              </div>
            {:else if q.type === "scale"}
              {@const min = q.scaleMin ?? 1}
              {@const max = q.scaleMax ?? 10}
              <div class="flex flex-wrap gap-2">
                {#each Array.from({ length: max - min + 1 }, (_, i) => min + i) as n}
                  <button type="button" disabled={alreadySubmitted}
                    class={chip(answerFor(q.id)?.number === n, "w-8")} aria-pressed={answerFor(q.id)?.number === n}
                    onclick={() => update(q, { number: n })}>{n}</button>
                {/each}
              </div>
            {:else if q.type === "boolean"}
              <div class={segmentTrack}>
                {#each [{ v: true, l: "Yes" }, { v: false, l: "No" }] as opt}
                  <button type="button" disabled={alreadySubmitted}
                    class={segment(answerFor(q.id)?.bool === opt.v)} aria-pressed={answerFor(q.id)?.bool === opt.v}
                    onclick={() => update(q, { bool: opt.v })}>{opt.l}</button>
                {/each}
              </div>
            {:else if q.type === "photo"}
              {#if answerFor(q.id)?.photoDataUrl}
                <img src={answerFor(q.id)?.photoDataUrl} alt="check-in" class="max-h-40 rounded-md border border-border" />
              {/if}
              {#if !alreadySubmitted}
                <Button variant="outline" size="sm" class="mt-1 self-start" onclick={() => void handlePhoto(q)}>{answerFor(q.id)?.photoDataUrl ? "Change photo" : "Add a photo"}</Button>
              {/if}
            {:else}
              <p class="text-xs text-muted-foreground">Update LogIt to answer this one.</p>
            {/if}
          </div>
          {/if}
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
