<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import {
    checkinPeriodLabel,
    type CheckinAnswer,
    type CheckinQuestion,
    type CheckinReviewInfo,
    type CheckinSchedule,
    type CheckinSubmission,
  } from "@logit/core/domain/Checkin";
  import { getCheckinRepo } from "$lib/data/repoProvider";
  import { cachedCoaches, cachedReviews, refreshCoaches } from "$lib/features/coaching/coachCache";

  // A check-in you sent, read-only: whether your coach reviewed it, their reply, your answers.

  const props = $props<{ params: { submissionId: string } }>();
  const id = $derived(props.params.submissionId);

  const ui = $state({ loading: true });
  let sub = $state<CheckinSubmission | null>(null);
  let form = $state<CheckinSchedule | null>(null);
  let review = $state<CheckinReviewInfo | null>(null);

  async function load() {
    const repo = getCheckinRepo();
    const [schedules, subs] = await Promise.all([repo.listAssignedSchedules(), repo.listSubmissions()]);
    sub = subs.find((s) => s.id === id && s.submittedAtMs !== undefined) ?? null;
    form = sub ? (schedules.find((s) => s.id === sub!.scheduleId) ?? null) : null;
    review = sub ? (cachedReviews().get(sub.id) ?? null) : null;
    ui.loading = false;
  }

  onMount(() => {
    void load().catch(() => (ui.loading = false));
    void refreshCoaches().then((ok) => { if (ok) void load(); });
  });

  const coach = $derived.by(() => {
    const all = cachedCoaches();
    return all.find((c) => c.coachId === review?.coachId) ?? (all.length === 1 ? all[0] : undefined);
  });
  const coachName = $derived(coach?.name ?? "Your coach");

  const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  type Row = { q: CheckinQuestion; a: CheckinAnswer | undefined };
  const SHORT = ["number", "scale", "boolean", "weight"];
  const rows = $derived.by((): Row[] => {
    if (!sub) return [];
    const qs: CheckinQuestion[] = form?.questions ?? sub.answers.map((a) => ({ id: a.questionId, prompt: "Answer", type: "text" as const }));
    return qs.map((q) => ({ q, a: sub!.answers.find((x) => x.questionId === q.id) }));
  });

  function value(r: Row): string | null {
    const a = r.a;
    if (!a) return null;
    switch (r.q.type) {
      case "boolean": return a.bool === undefined ? null : a.bool ? "Yes" : "No";
      case "weight": return a.number === undefined ? null : `${a.number} kg`;
      case "scale": return a.number === undefined ? null : `${a.number} / ${r.q.scaleMax ?? 10}`;
      case "photo": return null;
      default: return a.number !== undefined ? String(a.number) : (a.text?.trim() || null);
    }
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/checkins")} />
    <div class="min-w-0 flex-1">
      <p class="truncate text-base font-semibold">{form?.name ?? "Check-in"}</p>
      {#if sub}<p class="text-xs text-muted-foreground">{form ? checkinPeriodLabel({ schedule: form, periodStartMs: sub.periodStartMs }, date) : `Week of ${date(sub.periodStartMs)}`} · sent {weekday(sub.submittedAtMs!)}</p>{/if}
    </div>
  </PageHeader>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !sub}
    <p class="px-3 py-4 text-sm text-muted-foreground">This check-in wasn't found.</p>
  {:else}
    {#if review}
      <div class="mx-3 mt-3.5 flex flex-col gap-1.5 rounded-xl bg-success/10 px-3.5 py-3">
        <span class="text-[13px] font-semibold text-success">Reviewed by {coachName} on {weekday(review.reviewedAtMs)}</span>
        {#if review.reply}<span class="text-[13px] leading-snug text-muted-foreground">{coachName}'s reply: "{review.reply}"</span>{/if}
        {#if coach}<button type="button" class="w-fit text-[13px] text-muted-foreground underline" onclick={() => goto(`/messages/${coach.relationshipId}`)}>Open messages</button>{/if}
      </div>
    {:else}
      <p class="mx-3 mt-3.5 rounded-xl bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">Sent. {coachName} hasn't marked it as reviewed yet.</p>
    {/if}

    <div class="mt-2 flex flex-col">
      {#if rows.some((r) => SHORT.includes(r.q.type))}
        <div class="flex flex-wrap gap-x-7 gap-y-3 border-t border-border px-4 py-3.5">
          {#each rows.filter((r) => SHORT.includes(r.q.type)) as r (r.q.id)}
            <span class="flex flex-col gap-1"><span class="text-[13px] text-muted-foreground">{r.q.prompt}</span><span class="text-[15px] {value(r) ? '' : 'text-muted-foreground'}">{value(r) ?? "No answer"}</span></span>
          {/each}
        </div>
      {/if}
      {#each rows.filter((r) => !SHORT.includes(r.q.type)) as r (r.q.id)}
        <div class="flex flex-col gap-1 border-t border-border px-4 py-3.5">
          <span class="text-[13px] text-muted-foreground">{r.q.prompt}</span>
          {#if r.q.type === "photo"}
            {#if r.a?.photoDataUrl}<img src={r.a.photoDataUrl} alt={r.q.prompt} class="max-h-56 w-fit rounded-md border border-border" />{:else}<span class="text-[15px] text-muted-foreground">No photo</span>{/if}
          {:else}
            <span class="whitespace-pre-wrap text-[15px] leading-normal {value(r) ? '' : 'text-muted-foreground'}">{value(r) ?? "No answer"}</span>
          {/if}
        </div>
      {/each}
    </div>
    <p class="px-4 py-3 text-[13px] leading-normal text-muted-foreground">Sent check-ins can't be changed. Something to add? Message {coachName}.</p>
  {/if}
</div>
