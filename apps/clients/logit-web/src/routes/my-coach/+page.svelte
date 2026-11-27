<script lang="ts">
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { apiClient } from "@logit/core/api/client";
  import {
    coachApi,
    SHARE_ALL,
    type CoachRelationship,
    type MyCoachingRequest,
    type ReceivedInvite,
    type Sharing,
  } from "@logit/core/api/coachApi";
  import { currentPeriodIndex, missedCheckin, periodDueMs, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getWebDeps } from "$lib/deps";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
  import SharingSwitches from "$lib/features/coaching/SharingSwitches.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { programStatus } from "$lib/features/coaching/coachingData";
  import { loadAssignedForms, loadAssignedPrograms, loadMySubmissions } from "$lib/features/coaching/myCoachData";
  import { shortDate, sinceLabel, weekdayDate } from "$lib/features/coaching/format";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { page } from "$app/state";
  import { tick } from "svelte";
  import MyRequest from "$lib/features/coaching/requests/MyRequest.svelte";
  import { clientPaymentNote, shortDate as payDate } from "@logit/core/domain/coachPayments";

  // You as a client: your coach, what they've given you, your check-ins and what they can see.

  let coaches = $state<CoachRelationship[]>([]);
  let invites = $state<ReceivedInvite[]>([]);
  let requests = $state<MyCoachingRequest[]>([]);
  let programs = $state<CoachProgram[]>([]);
  let forms = $state<CheckinSchedule[]>([]);
  let subs = $state<CheckinSubmission[]>([]);
  let reviewed = $state<Set<string>>(new Set());
  let sessions = $state<WorkoutSession[]>([]);
  let inviteSharing = $state<Record<string, Sharing>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let stopping = $state<CoachRelationship | null>(null);

  async function load() {
    try {
      const [c, i, r] = await Promise.all([coachApi.listCoaches(), coachApi.listReceivedInvites(), coachApi.listMyRequests(true).catch(() => [])]);
      coaches = c;
      invites = i;
      requests = r;
      for (const inv of i) inviteSharing[inv.relationshipId] ??= { ...SHARE_ALL };
      if (c.length) {
        const [p, f, s, rv, ss] = await Promise.all([
          loadAssignedPrograms().catch(() => []),
          loadAssignedForms().catch(() => []),
          loadMySubmissions().catch(() => []),
          coachApi.myCheckinReviews().catch(() => []),
          getWebDeps().workoutRepo.listAllSessions().catch(() => []),
        ]);
        programs = p;
        forms = f;
        subs = s;
        reviewed = new Set(rv.map((x) => x.submissionId));
        sessions = ss;
      }
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your coach";
    } finally {
      loading = false;
    }
  }
  // From an email or the ask page: straight to that request's conversation.
  const focusRequest = page.url.searchParams.get("request");
  onMount(async () => {
    await load();
    if (focusRequest) {
      await tick();
      document.getElementById(`request-${focusRequest}`)?.scrollIntoView({ block: "start" });
    }
  });
  const openRequests = $derived(requests.filter((r) => !r.closed));

  // Which week of which program you're on, and which of its days you've done.
  const running = $derived(programs.map((p) => ({ p, s: programStatus(p) })).filter((x) => x.s.state !== "finished"));

  function dayDone(p: CoachProgram, dayId: string, weekStartMs: number): boolean {
    return sessions.some((s) => s.source?.kind === "program" && s.source.parentId === p.id && s.source.dayId === dayId && s.startedAtMs >= weekStartMs);
  }

  type Due = { form: CheckinSchedule; dueMs: number; draft: boolean; late: boolean };
  const due = $derived.by((): Due[] => {
    const out: Due[] = [];
    for (const f of forms) {
      const missed = missedCheckin(f, subs);
      if (missed) {
        out.push({ form: f, dueMs: missed.dueMs, draft: subs.some((s) => s.scheduleId === f.id && s.periodIndex === missed.periodIndex), late: true });
        continue;
      }
      const p = currentPeriodIndex(f);
      if (p === null) {
        out.push({ form: f, dueMs: 0, draft: false, late: false });
        continue;
      }
      const sub = subs.find((s) => s.scheduleId === f.id && s.periodIndex === p);
      if (!sub?.submittedAtMs) out.push({ form: f, dueMs: periodDueMs(f, p), draft: !!sub, late: false });
    }
    return out;
  });
  const sent = $derived(subs.filter((s) => s.submittedAtMs).sort((a, b) => b.submittedAtMs! - a.submittedAtMs!).slice(0, 6));

  async function changeSharing(c: CoachRelationship, next: Sharing) {
    const before = c.sharing ?? SHARE_ALL;
    c.sharing = next;
    try {
      c.sharing = await coachApi.updateSharing(c.relationshipId, next);
    } catch (e) {
      c.sharing = before;
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }

  async function answerInvite(inv: ReceivedInvite, accept: boolean) {
    busy = inv.relationshipId;
    try {
      if (accept) await coachApi.acceptInvite(inv.relationshipId, inviteSharing[inv.relationshipId]);
      else await coachApi.declineInvite(inv.relationshipId);
      toast.success(accept ? `${inv.coach.displayName || inv.coach.username} is now your coach` : "Invite declined");
      loading = true;
      await load();
      void coachBadges.refresh(undefined, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = null;
    }
  }

  async function stop() {
    const c = stopping;
    stopping = null;
    if (!c) return;
    try {
      await coachApi.revokeRelationship(c.relationshipId);
      toast.success(`You've stopped coaching with ${c.coach.displayName || c.coach.username}`);
      loading = true;
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop coaching");
    }
  }

  const coachName = (c: { coach: { displayName: string; username: string } }) => c.coach.displayName || c.coach.username;

  // Stripe's billing page for this plan: change a card that failed (Stripe takes the overdue
  // payment straight away), see receipts. Only on the web; the app never links to paying.
  async function openBilling(c: CoachRelationship) {
    busy = c.relationshipId;
    try {
      location.href = (await coachPaymentsApi.myBillingPage(c.relationshipId)).url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
      busy = null;
    }
  }

  // Stop (or keep) paying a coach monthly. Coaching runs to the end of the month paid for.
  let stoppingPlan = $state<CoachRelationship | null>(null);
  async function setPlanStop(c: CoachRelationship, stop: boolean) {
    stoppingPlan = null;
    busy = c.relationshipId;
    try {
      await coachPaymentsApi.stopMyPlan(c.relationshipId, stop);
      toast.success(stop ? "Your plan stops at the end of the month" : "Your plan carries on");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = null;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <Skeleton class="h-14 w-80" /><Skeleton class="h-72" />
  {:else}
    {#each invites as inv (inv.relationshipId)}
      <section class="flex flex-col gap-3 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
        <div class="flex items-center gap-3">
          <Avatar name={coachName(inv)} url={inv.coach.avatarUrl} size={40} />
          <div>
            <h2 class="text-sm font-semibold">{coachName(inv)} wants to coach you</h2>
            <p class="text-xs text-muted-foreground">@{inv.coach.username} · pick what they can see, then accept</p>
          </div>
        </div>
        <div class="max-w-md">
          <SharingSwitches sharing={inviteSharing[inv.relationshipId] ?? SHARE_ALL} disabled={busy === inv.relationshipId} onchange={(s) => (inviteSharing[inv.relationshipId] = s)} />
        </div>
        <div class="flex gap-2">
          <button type="button" disabled={busy === inv.relationshipId} onclick={() => answerInvite(inv, true)} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Accept</button>
          <button type="button" disabled={busy === inv.relationshipId} onclick={() => answerInvite(inv, false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Decline</button>
        </div>
      </section>
    {/each}

    {#if requests.length}
      <!-- Requests you sent (canvas A1–A3, R5): each is a conversation with that coach. -->
      <div class="flex flex-col gap-2">
        {#if coaches.length}
          <p class="text-xs text-muted-foreground">{openRequests.length} coach {openRequests.length === 1 ? "request" : "requests"} open{#if openRequests.length} · {openRequests.map((r) => `${coachName(r)}${r.stage === "waiting" ? ", waiting list" : ""}`).join(" · ")}{/if}. {coachName(coaches[0]!)} can't see your requests.</p>
        {/if}
        {#each requests as r (r.relationshipId)}
          <MyRequest request={r} open={!r.closed || r.relationshipId === focusRequest} onchange={load} />
        {/each}
      </div>
    {/if}

    {#if coaches.length === 0 && invites.length === 0 && requests.length === 0}
      <header><h1 class="text-[26px] font-bold tracking-tight">My coach</h1></header>
      <section data-guide="my-coach-page" class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">You don't have a coach on LogIt</h2>
        <p class="text-[13px] leading-relaxed text-muted-foreground">
          A coach can invite you by your username (@{apiClient.getUser()?.username}), or send you an invite link. Either way you choose what they see,
          and you can stop any time.
        </p>
      </section>
    {/if}

    {#each coaches as c (c.relationshipId)}
      {@const name = coachName(c)}
      {@const sharing = c.sharing ?? SHARE_ALL}
      {@const paused = c.status === "paused"}
      {@const note = clientPaymentNote(c.payment, c.status, name)}
      <header data-guide="my-coach-page" class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3.5">
          <Avatar name={name} url={c.coach.avatarUrl} size={48} />
          <div>
            <h1 class="text-2xl font-bold tracking-tight">{name}, your coach</h1>
            <p class="mt-0.5 text-[13px] text-muted-foreground">@{c.coach.username}{sinceLabel(c.since) ? ` · coaching you since ${sinceLabel(c.since)}` : ""}</p>
          </div>
        </div>
        {#if due[0] && coaches.length === 1 && !paused}
          <a href="/my-coach/checkin/{due[0].form.id}" class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold leading-[34px] text-primary-foreground">{due[0].draft ? "Finish" : "Fill in"} {due[0].form.name.toLowerCase()}</a>
        {/if}
      </header>

      {#if note && note.tone !== "ok"}
        <section role="status" class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border px-[18px] py-4 {note.tone === 'bad' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}">
          <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h2 class="text-sm font-semibold">{note.title}</h2>
          <p class="text-[13px] leading-relaxed">{note.body}</p>
          </div>
          {#if c.payment?.mode === "stripe" && c.payment.state === "failed"}
            <button type="button" disabled={busy === c.relationshipId} onclick={() => openBilling(c)}
              class="h-10 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Update card ↗</button>
          {/if}
        </section>
      {/if}

      <div class="flex flex-wrap items-start gap-4">
        <div class="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
          {#if coaches.length === 1 && !paused}
            {#each running as { p, s } (p.id)}
              {@const weekNo = s.week ?? 1}
              {@const wk = p.weeks.find((w) => w.weekNumber === weekNo)}
              {@const weekStart = s.state === "running" ? (s.endsAtMs ?? 0) - (s.totalWeeks - weekNo + 1) * 7 * 86_400_000 : 0}
              <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 class="text-sm font-semibold">{p.name}</h2>
                  <span class="text-xs text-muted-foreground">{s.state === "running" ? `Week ${s.week} of ${s.totalWeeks}` : s.state === "scheduled" ? `Starts ${weekdayDate(s.startsAtMs!)}` : "Tap Start on your phone to begin"}</span>
                </div>
                {#if wk}
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
                    {#each [...wk.days].sort((a, b) => a.orderIndex - b.orderIndex) as d, i (d.id)}
                      {@const done = s.state === "running" && dayDone(p, d.id, weekStart)}
                      <div class="rounded-lg bg-muted px-3 py-2.5">
                        <div class="text-[13px] font-semibold">{d.weekday != null ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.weekday]} · ` : ""}{d.name ?? `Day ${i + 1}`}</div>
                        <div class="text-xs {done ? 'text-success' : 'text-muted-foreground'}">{done ? "Done" : `${d.blocks.length} exercise${d.blocks.length === 1 ? "" : "s"}`}</div>
                      </div>
                    {/each}
                  </div>
                {/if}
                {#if p.description}<p class="text-[13px] leading-relaxed"><span class="text-muted-foreground">{name}'s note:</span> {p.description}</p>{/if}
                <a href="/plan/programs" class="text-xs text-muted-foreground hover:text-foreground">See every week ›</a>
              </section>
            {/each}
          {/if}

          {#if !paused}
            <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] pb-4 pt-3">
              <h2 class="pb-1 text-sm font-semibold">Messages</h2>
              <MessageThread relationshipId={c.relationshipId} otherName={name} onRead={() => void coachBadges.refresh(undefined, true)} />
            </section>
          {/if}
        </div>

        <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {#if coaches.length === 1 && (due.length || sent.length)}
            <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
              <h2 class="pb-1.5 text-sm font-semibold">Check-ins</h2>
              {#each due as d (d.form.id)}
                <a href="/my-coach/checkin/{d.form.id}" class="flex justify-between gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-90">
                  <span class="font-medium">{d.form.name}</span>
                  <span class="text-xs {d.late ? 'text-destructive' : 'text-muted-foreground'}">{d.late ? `Late, was due ${weekdayDate(d.dueMs)}` : d.dueMs ? `Due ${weekdayDate(d.dueMs)}` : "Whenever"}{d.draft ? " · draft" : ""}</span>
                </a>
              {/each}
              {#each sent as s (s.id)}
                {@const f = forms.find((x) => x.id === s.scheduleId)}
                <a href="/my-coach/checkins/{s.id}" class="flex justify-between gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-90">
                  <span>{f?.name ?? "Check-in"} <span class="text-muted-foreground">· week of {shortDate(s.periodStartMs)}</span></span>
                  <span class="text-xs text-muted-foreground">{reviewed.has(s.id) ? "Reviewed" : "Sent"} ›</span>
                </a>
              {/each}
              <a href="/my-coach/checkins" class="border-t border-border pt-2.5 text-xs text-muted-foreground hover:text-foreground">All check-ins ›</a>
            </section>
          {/if}

          {#if c.payment && c.payment.mode === "stripe"}
            <section class="flex flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4">
              <h2 class="text-sm font-semibold">Your plan with {name}</h2>
              <p class="text-[13px] font-medium">{c.payment.packageName}</p>
              <p class="text-xs leading-relaxed text-muted-foreground">
                {note?.tone === "ok" ? note.body : c.payment.state === "ended" ? "Ended." : "Payment problem, see above."}
              </p>
              <button type="button" disabled={busy === c.relationshipId} onclick={() => openBilling(c)} class="mt-2 h-[34px] w-fit rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Manage payment ↗</button>
              <p class="text-xs leading-relaxed text-muted-foreground">Your card, receipts and invoices, on Stripe's secure page.</p>
              {#if c.payment.canStop}
                {#if c.payment.stopsAtPeriodEnd}
                  <button type="button" disabled={busy === c.relationshipId} onclick={() => setPlanStop(c, false)} class="mt-2 h-[34px] w-fit rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Keep my plan going</button>
                {:else}
                  <button type="button" disabled={busy === c.relationshipId} onclick={() => (stoppingPlan = c)} class="mt-2 h-[34px] w-fit rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Stop paying at the end of the month</button>
                {/if}
              {/if}
            </section>
          {/if}

          <section class="flex flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4">
            <h2 class="text-sm font-semibold">What {name} can see</h2>
            <p class="pb-2 text-xs leading-relaxed text-muted-foreground">Switching one off hides it from {name} straight away, past entries too. Switch it back on and they see it all again.</p>
            <SharingSwitches {sharing} onchange={(s) => changeSharing(c, s)} />
            <button type="button" onclick={() => (stopping = c)} class="mt-2.5 h-[34px] w-fit rounded-[9px] border border-destructive/45 px-3 text-[13px] text-destructive hover:bg-destructive/10">Stop coaching with {name}</button>
          </section>
        </div>
      </div>
    {/each}
  {/if}
</div>

<AlertDialog.Root open={stopping !== null} onOpenChange={(o) => { if (!o) stopping = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop coaching with {stopping ? coachName(stopping) : ""}?</AlertDialog.Title>
      <AlertDialog.Description>They stop seeing your data straight away, and their program, check-ins and habits leave your app. Your own workouts and logs stay.{stopping?.payment?.mode === "stripe" && stopping.payment.state !== "ended" ? " Your plan with them is cancelled now, so you won't be charged again." : ""}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={stop}>Stop coaching</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={stoppingPlan !== null} onOpenChange={(o) => { if (!o) stoppingPlan = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop paying {stoppingPlan ? coachName(stoppingPlan) : ""}?</AlertDialog.Title>
      <AlertDialog.Description>You won't be charged again. Coaching carries on until {payDate(stoppingPlan?.payment?.paidUntil)}, the end of the month you've paid for. After that it's up to your coach.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => stoppingPlan && setPlanStop(stoppingPlan, true)}>Stop paying</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
