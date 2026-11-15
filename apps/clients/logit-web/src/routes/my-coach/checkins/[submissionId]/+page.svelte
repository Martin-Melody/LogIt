<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { checkinPeriodLabel, type CheckinSchedule, type CheckinSubmission, type CheckinReviewInfo } from "@logit/core/domain/Checkin";
  import CheckinAnswers from "$lib/features/coaching/CheckinAnswers.svelte";
  import { coachNameFor, loadMyCheckins, type MyCheckins } from "$lib/features/coaching/myCheckins";
  import { shortDate, weekdayDate } from "$lib/features/coaching/format";

  // One check-in you sent, read-only, with whether your coach reviewed it and their reply.

  const id = $derived(page.params.submissionId!);
  let data = $state<MyCheckins | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      data = await loadMyCheckins();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the check-in";
    }
  });

  const sub = $derived<CheckinSubmission | null>(data?.subs.find((s) => s.id === id && s.submittedAtMs !== undefined) ?? null);
  const form = $derived<CheckinSchedule | null>(sub ? (data?.forms.find((f) => f.id === sub.scheduleId) ?? null) : null);
  const review = $derived<CheckinReviewInfo | null>(sub ? (data?.reviews.get(sub.id) ?? null) : null);
  const coachName = $derived(data ? coachNameFor(data.coaches, review?.coachId) : "Your coach");
  const previous = $derived(
    sub && data
      ? data.subs.filter((s) => s.scheduleId === sub.scheduleId && s.submittedAtMs !== undefined && s.periodStartMs < sub.periodStartMs)
          .sort((a, b) => b.periodStartMs - a.periodStartMs)[0] ?? null
      : null,
  );
</script>

<div class="mx-auto flex w-full max-w-[720px] flex-col gap-4">
  <a href="/my-coach/checkins" class="w-fit text-[13px] text-muted-foreground hover:text-foreground">‹ Check-ins</a>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-64" />
  {:else if !sub}
    <p class="text-[13px] text-muted-foreground">This check-in wasn't found, or hasn't been sent. <a href="/my-coach/checkins" class="text-primary hover:underline">Back to check-ins</a></p>
  {:else}
    <header>
      <h1 class="text-2xl font-bold tracking-tight">{form?.name ?? "Check-in"}</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">{form ? checkinPeriodLabel({ schedule: form, periodStartMs: sub.periodStartMs }, shortDate) : `Week of ${shortDate(sub.periodStartMs)}`} · sent {weekdayDate(sub.submittedAtMs!)}</p>
    </header>

    {#if review}
      <section class="flex flex-col gap-1.5 rounded-[10px] bg-success/10 px-4 py-3">
        <span class="text-[13px] font-semibold text-success">Reviewed by {coachName} on {weekdayDate(review.reviewedAtMs)}</span>
        {#if review.reply}<p class="text-[13px] leading-relaxed text-muted-foreground">{coachName}'s reply: "{review.reply}"</p>{/if}
        <a href="/my-coach" class="w-fit text-[13px] text-muted-foreground underline hover:text-foreground">Open messages</a>
      </section>
    {:else}
      <p class="rounded-[10px] bg-muted px-4 py-3 text-[13px] text-muted-foreground">Sent. {coachName} hasn't marked it as reviewed yet.</p>
    {/if}

    <section class="rounded-[10px] border border-border bg-card px-[18px] py-4">
      <CheckinAnswers schedule={form} submission={sub} {previous} />
    </section>
    <p class="text-[13px] text-muted-foreground">Sent check-ins can't be changed. Something to add? <a href="/my-coach" class="underline hover:text-foreground">Message {coachName}</a>.</p>
  {/if}
</div>
