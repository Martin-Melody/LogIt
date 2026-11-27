<script lang="ts">
  import ConfirmDialog, { type Ask } from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { onMount } from "svelte";
  import { goto, beforeNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type CoachRelationship } from "@logit/core/api/coachApi";
  import {
    createSubmission,
    currentPeriodIndex,
    markSubmitted,
    missedCheckin,
    missingAnswers,
    periodDueMs,
    setAnswer,
    type CheckinAnswer,
    type CheckinQuestion,
    type CheckinSchedule,
    type CheckinSubmission,
  } from "@logit/core/domain/Checkin";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { getOwnNutritionDeps } from "$lib/deps";
  import CheckinAnswers from "$lib/features/coaching/CheckinAnswers.svelte";
  import QuestionField from "$lib/features/coaching/forms/QuestionField.svelte";
  import { loadAssignedForms, loadMySubmissions, saveMySubmission } from "$lib/features/coaching/myCoachData";
  import { shortDate, weekdayDate } from "$lib/features/coaching/format";

  // Filling in a coach's check-in on the web. Same rules as the phone: one per period, a
  // draft syncs between devices, and once sent it's read-only.

  const scheduleId = $derived(page.params.scheduleId!);

  let form = $state<CheckinSchedule | null>(null);
  let sub = $state<CheckinSubmission | null>(null);
  let coach = $state<CoachRelationship | null>(null);
  let weightHint = $state<{ kg: number; today: boolean } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let dirty = $state(false);
  let draftSavedAt = $state<number | null>(null);
  let missing = $state<string[]>([]);

  onMount(async () => {
    try {
      const [forms, subs, coaches] = await Promise.all([loadAssignedForms(), loadMySubmissions(), coachApi.listCoaches()]);
      form = forms.find((f) => f.id === scheduleId) ?? null;
      coach = coaches[0] ?? null;
      if (!form) return;
      // A missed one comes first: it's the one the coach is waiting for.
      const missed = missedCheckin(form, subs);
      // The period a check-ins list row asked for, else the missed one, else this one.
      const asked = Number(page.url.searchParams.get("period"));
      const period = page.url.searchParams.has("period") && Number.isInteger(asked) && asked >= 0
        ? asked
        : missed?.periodIndex ?? currentPeriodIndex(form) ?? 0;
      sub = subs.find((s) => s.scheduleId === form!.id && s.periodIndex === period) ?? createSubmission(form, period);
      if (sub.submittedAtMs === undefined) draftSavedAt = sub.updatedAtMs !== sub.createdAtMs ? sub.updatedAtMs : null;
      await prefillWeight();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the check-in";
    } finally {
      loading = false;
    }
  });

  // Body-weight questions start from your latest weigh-in, if you haven't answered yet.
  async function prefillWeight() {
    if (!form || !sub || sub.submittedAtMs) return;
    const weightQs = form.questions.filter((q) => q.type === "weight" && !answer(q.id));
    if (!weightQs.length) return;
    try {
      const since = localDateIso(new Date(Date.now() - 14 * 86_400_000));
      const entries = await getOwnNutritionDeps().nutritionRepo.listWeightEntries(since);
      const latest = entries.filter((e) => !e.deletedAtMs).sort((a, b) => b.dateIso.localeCompare(a.dateIso))[0];
      if (!latest) return;
      weightHint = { kg: latest.weightKg, today: latest.dateIso === localDateIso(new Date()) };
      for (const q of weightQs) sub = setAnswer(sub!, q.id, { number: Math.round(latest.weightKg * 10) / 10 });
    } catch {
      /* no hint */
    }
  }

  let ask = $state<Ask | null>(null);
  let leaving = false;
  beforeNavigate((nav) => {
    if (leaving || !dirty || saving) return;
    nav.cancel(); // closing the tab ('leave') gets the browser's own prompt from this
    const to = nav.to?.url;
    if (nav.type === "leave" || !to) return;
    ask = { title: "Leave without saving?", text: "Your answers so far will be lost.", action: "Leave", run: () => { leaving = true; void goto(to); } };
  });

  const sent = $derived(!!sub?.submittedAtMs);
  const coachName = $derived(coach ? coach.coach.displayName || coach.coach.username : "your coach");
  const dueText = $derived.by(() => {
    if (!form || !sub) return "";
    if (form.cadence === "manual") return "";
    const due = periodDueMs(form, sub.periodIndex);
    return due < Date.now() ? `was due ${weekdayDate(due)}` : `due ${weekdayDate(due)}`;
  });

  function answer(id: string): CheckinAnswer | undefined {
    return sub?.answers.find((a) => a.questionId === id);
  }

  function set(q: CheckinQuestion, value: Omit<CheckinAnswer, "questionId">) {
    if (!sub || sent) return;
    sub = setAnswer(sub, q.id, value);
    dirty = true;
    missing = missing.filter((m) => m !== q.id);
  }

  async function save(submit: boolean) {
    if (!sub || !form) return;
    if (submit) {
      missing = missingAnswers(form, sub).map((q) => q.id);
      if (missing.length) {
        document.getElementById(`q-${missing[0]}`)?.focus();
        return;
      }
    }
    saving = true;
    try {
      // Sent with the questions as they are now, so later edits don't change what was asked.
      const next = submit ? markSubmitted(sub, form) : { ...sub, updatedAtMs: Date.now() };
      await saveMySubmission(next);
      sub = next;
      dirty = false;
      if (submit) {
        toast.success(`Sent to ${coachName}`);
        await goto("/my-coach");
      } else {
        draftSavedAt = next.updatedAtMs;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      saving = false;
    }
  }

</script>

<div class="flex flex-col gap-4">
  <a href="/my-coach" class="w-fit text-[13px] text-muted-foreground hover:text-foreground">‹ My coach</a>

  {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}

  {#if loading}
    <Skeleton class="h-10 w-80" /><Skeleton class="h-96" />
  {:else if !form || !sub}
    <p class="text-[13px] text-muted-foreground">This check-in isn't assigned to you any more.</p>
  {:else}
    <header>
      <h1 class="text-2xl font-bold tracking-tight">{form.name} for {coachName}</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">
        {form.cadence === "manual" ? "" : `Week of ${shortDate(sub.periodStartMs)}`}{dueText ? ` · ${dueText}` : ""}
        {#if sent}{` · sent ${shortDate(sub.submittedAtMs!)}`}{:else if draftSavedAt}{` · draft saved, also on your phone`}{/if}
      </p>
    </header>

    {#if sent}
      <section class="flex max-w-3xl flex-col rounded-[10px] border border-border bg-card px-[22px] py-4">
        <p class="pb-2 text-[13px] text-muted-foreground">Sent. {coachName} will see it in their check-ins.</p>
        <CheckinAnswers schedule={form} submission={sub} />
      </section>
    {:else}
      <form class="flex max-w-3xl flex-col rounded-[10px] border border-border bg-card px-[22px] pb-5 pt-2" onsubmit={(e) => { e.preventDefault(); void save(true); }}>
        {#each form.questions as q, i (q.id)}
          {@const a = answer(q.id)}
          {@const bad = missing.includes(q.id)}
          <div class="py-4 {i ? 'border-t border-border' : ''}">
            <QuestionField {q} answer={a} invalid={bad} {coachName} onchange={(v) => set(q, v)}
              weightHint={q.type === "weight" && weightHint ? `Filled in from your ${weightHint.today ? "weigh-in this morning" : "latest weigh-in"}. Change it if you like.` : null} />
          </div>
        {/each}
        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <button type="button" disabled={saving || !dirty} onclick={() => save(false)} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] hover:bg-muted disabled:opacity-50">Save draft</button>
          <button type="submit" disabled={saving} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send to {coachName}</button>
        </div>
      </form>
    {/if}
  {/if}
</div>

<ConfirmDialog bind:ask />
