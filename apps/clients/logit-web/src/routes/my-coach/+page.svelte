<script lang="ts">
  import { offerStateNow } from "@logit/core/domain/coachRequest";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { goto } from "$app/navigation";
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
  import SharingSwitches from "$lib/features/coaching/SharingSwitches.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { programStatus } from "$lib/features/coaching/coachingData";
  import { loadAssignedForms, loadAssignedPrograms, loadMySubmissions } from "$lib/features/coaching/myCoachData";
  import { shortDate, sinceLabel, weekdayDate } from "$lib/features/coaching/format";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { page } from "$app/state";
  import { tick } from "svelte";
  import MyRequest from "$lib/features/coaching/requests/MyRequest.svelte";
  import AgreementDialog from "$lib/features/coaching/requests/AgreementDialog.svelte";
  import { Button } from "$lib/components/ui/button";
  import { awayExcuse, type ManageCoaching } from "@logit/core/api/coachApi";
  import { clientPaymentNote, formatMoney, shortDate as payDate } from "@logit/core/domain/coachPayments";

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
  // Canvas M1, E2, Z2: each coach's pause, end date, agreement, and whether they've gone quiet.
  let manage = $state<Record<string, ManageCoaching>>({});
  let stoppingQuiet = $state<CoachRelationship | null>(null);
  let readingAgreement = $state<string | null>(null);

  async function load() {
    try {
      const [c, i, r] = await Promise.all([coachApi.listCoaches(), coachApi.listReceivedInvites(), coachApi.listMyRequests(true).catch(() => [])]);
      coaches = c;
      invites = i;
      requests = r;
      const m = await Promise.all(c.map((x) => coachApi.manageCoaching(x.relationshipId).catch(() => null)));
      manage = Object.fromEntries(c.flatMap((x, k) => (m[k] ? [[x.relationshipId, m[k]!]] : [])));
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
    // Back from Stripe's card page (canvas Z3): try the unpaid payment now.
    const card = page.url.searchParams.get("card");
    if (card && coaches.find((x) => x.relationshipId === card)?.payment?.state === "failed") {
      const r = await coachApi.retryPayment(card).catch(() => ({ paid: false, error: undefined as string | undefined }));
      if (r.paid) toast.success("Paid. Coaching is back on.");
      else toast.error(r.error ?? "The payment didn't go through yet. Stripe tries again over the next few days.");
      await load();
    }
    // Back from paying for a changed package (canvas K14).
    const changed = page.url.searchParams.get("changed");
    const sessionId = page.url.searchParams.get("session_id");
    if (changed && sessionId) {
      const r = await coachPaymentsApi.confirmChangeCheckout(changed, sessionId).catch(() => ({ status: "pending" as const }));
      if (r.status === "active") toast.success("Paid. You're on your new package.");
      else toast.message("Stripe is still confirming the payment. It shows here when it's done.");
      void goto("/my-coach", { replaceState: true, noScroll: true });
      await load();
    }
    if (focusRequest) {
      await tick();
      document.getElementById(`request-${focusRequest}`)?.scrollIntoView({ block: "start" });
    }
  });
  const openRequests = $derived(requests.filter((r) => !r.closed));

  // Canvas MS4: with more than one coach, invite or request, a list on the left and one at a time
  // on the right; chats are in Me › Messages.
  type Pick = { rel: string; name: string; status: string; tone: "b" | "a" | "o"; line: string };
  const picks = $derived.by((): Pick[] => [
    ...coaches.map((c) => ({ rel: c.relationshipId, name: coachName(c), status: c.status === "paused" ? "Paused" : "Coaching you", tone: "b" as const, line: `@${c.coach.username}` })),
    ...invites.map((i) => ({ rel: i.relationshipId, name: coachName(i), status: "Invited you", tone: "a" as const, line: i.offer?.card.packageName ?? "Wants to coach you" })),
    ...requests.filter((r) => !coaches.some((c) => c.relationshipId === r.relationshipId)).map((r) => {
      const offer = r.stage === "offered" && r.offer && offerStateNow(r.offer, Date.now()) === "open";
      return { rel: r.relationshipId, name: coachName(r), status: r.closed ? "Closed" : offer ? "Offer to look at" : r.stage === "waiting" ? "Waiting list" : "Asked", tone: (offer ? "b" : r.stage === "waiting" ? "a" : "o") as "b" | "a" | "o", line: offer && r.offer ? r.offer.card.packageName : `Asked ${shortDate(Date.parse(r.requestedAt))}` };
    }),
  ].sort((a, b) => (a.status === "Closed" ? 1 : 0) - (b.status === "Closed" ? 1 : 0)));
  const chosen = $derived(page.url.searchParams.get("c") ?? page.url.searchParams.get("request") ?? picks[0]?.rel ?? null);
  const split = $derived(picks.length > 1);
  const show = (rel: string) => !split || chosen === rel;

  // Which week of which program you're on, and which of its days you've done.
  const running = $derived(programs.map((p) => ({ p, s: programStatus(p) })).filter((x) => x.s.state !== "finished"));

  function dayDone(p: CoachProgram, dayId: string, weekStartMs: number): boolean {
    return sessions.some((s) => s.source?.kind === "program" && s.source.parentId === p.id && s.source.dayId === dayId && s.startedAtMs >= weekStartMs);
  }

  type Due = { form: CheckinSchedule; dueMs: number; draft: boolean; late: boolean };
  const due = $derived.by((): Due[] => {
    const out: Due[] = [];
    // Canvas Z7: due while the coach was away isn't late.
    // shortcut: forms don't record their coach, so this only applies with one coach; add the coach id to schedules if clients ever keep two.
    const excuse = coaches.length === 1 ? awayExcuse(coaches[0].away) : null;
    for (const f of forms) {
      const missed = missedCheckin(f, subs, undefined, excuse);
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
      const r = await coachApi.stopCoaching(c.relationshipId);
      toast.success(r.status === "ending" && r.endsAt
        ? `Your plan stops renewing. Coaching with ${coachName(c)} carries on until ${shortDate(Date.parse(r.endsAt))}.`
        : `You've stopped coaching with ${coachName(c)}`);
      loading = true;
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop coaching");
    }
  }

  const coachName = (c: { coach: { displayName: string; username: string } }) => c.coach.displayName || c.coach.username;

  async function stopQuiet() {
    const c = stoppingQuiet;
    stoppingQuiet = null;
    if (!c) return;
    try {
      const r = await coachApi.stopCoaching(c.relationshipId, true);
      toast.success(r.refundedCents ? `Coaching stopped. ${formatMoney(r.refundedCents, r.currency ?? "eur")} is on its way back to your card.` : "Coaching stopped");
      loading = true;
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop coaching");
    }
  }

  // Stripe's billing page for this plan: change a card that failed (Stripe takes the overdue
  // payment straight away), see receipts. Only on the web; the app never links to paying.
  // Canvas K14: answer a change of package, or pay for it when it's due.
  async function answerChange(c: CoachRelationship, offerId: string, accept: boolean) {
    busy = c.relationshipId;
    try {
      await coachPaymentsApi.answerPackageChange(c.relationshipId, offerId, accept);
      toast.success(accept ? "Accepted. It starts at your next payment." : "You kept your package");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      busy = null;
    }
  }
  async function payChange(c: CoachRelationship) {
    busy = c.relationshipId;
    try {
      const back = `${location.origin}/my-coach`;
      location.href = (await coachPaymentsApi.payChange(c.relationshipId, `${back}?changed=${c.relationshipId}`, back)).url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
      busy = null;
    }
  }

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
    {#if split}<h1 class="text-[26px] font-bold tracking-tight">My coach</h1>{/if}
    <div class={split ? "grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]" : "contents"}>
    {#if split}
      <nav aria-label="Your coaches and requests" class="flex flex-col gap-0.5 rounded-[10px] border border-border bg-card p-2">
        {#each picks as p (p.rel)}
          <a href="/my-coach?c={p.rel}" data-sveltekit-noscroll data-sveltekit-replacestate class="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 {chosen === p.rel ? 'bg-muted' : 'hover:bg-muted/50'}">
            <span class="flex items-center gap-2"><span class="flex-1 truncate text-[13px] {chosen === p.rel ? 'font-semibold' : 'font-medium'}">{p.name}</span><span class="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold {p.tone === 'b' ? 'bg-info/15 text-info' : p.tone === 'a' ? 'bg-warning/15 text-warning' : 'border border-border text-muted-foreground'}">{p.status}</span></span>
            <span class="truncate text-xs text-muted-foreground">{p.line}</span>
          </a>
        {/each}
      </nav>
    {/if}
    <div class={split ? "flex min-w-0 flex-col gap-4" : "contents"}>
    {#each invites.filter((x) => show(x.relationshipId)) as inv (inv.relationshipId)}
      <section class="flex flex-col gap-3 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
        <div class="flex items-center gap-3">
          <Avatar name={coachName(inv)} url={inv.coach.avatarUrl} size={40} />
          <div>
            <h2 class="text-sm font-semibold">{coachName(inv)} wants to coach you</h2>
            <p class="text-xs text-muted-foreground">@{inv.coach.username} · pick what they can see, then accept</p>
          </div>
        </div>
        {#if inv.offer && inv.offer.state === "open"}
          <!-- K13: an invite with an offer is taken like any offer (agreement, sharing, paying). -->
          <p class="text-[13px]">{inv.offer.card.packageName} · {inv.offer.card.pays ? `${formatMoney(inv.offer.card.amountCents, inv.offer.card.currency)}${inv.offer.card.interval === "month" ? " a month" : ""}` : "no payment through LogIt"}</p>
          <div class="flex gap-2">
            <a href="/take/{inv.offer.card.offerId}" class="inline-flex h-[34px] items-center rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">See the offer</a>
            <button type="button" disabled={busy === inv.relationshipId} onclick={() => answerInvite(inv, false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Decline</button>
          </div>
        {:else}
        <div class="max-w-md">
          <SharingSwitches sharing={inviteSharing[inv.relationshipId] ?? SHARE_ALL} disabled={busy === inv.relationshipId} onchange={(s) => (inviteSharing[inv.relationshipId] = s)} />
        </div>
        <div class="flex gap-2">
          <button type="button" disabled={busy === inv.relationshipId} onclick={() => answerInvite(inv, true)} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Accept</button>
          <button type="button" disabled={busy === inv.relationshipId} onclick={() => answerInvite(inv, false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted disabled:opacity-50">Decline</button>
        </div>
        {/if}
      </section>
    {/each}

    {#if requests.length}
      <!-- Requests you sent (canvas A1–A3, R5): each is a conversation with that coach. -->
      <div class="flex flex-col gap-2">
        {#if coaches.length}
          <p class="text-xs text-muted-foreground">{openRequests.length} coach {openRequests.length === 1 ? "request" : "requests"} open{#if openRequests.length} · {openRequests.map((r) => `${coachName(r)}${r.stage === "waiting" ? ", waiting list" : ""}`).join(" · ")}{/if}. {coachName(coaches[0]!)} can't see your requests.</p>
        {/if}
        {#each requests as r (r.relationshipId)}
          {#if show(r.relationshipId)}<MyRequest request={r} open={!r.closed || r.relationshipId === focusRequest} onchange={load} chat={false} />{/if}
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

    {#each coaches.filter((x) => show(x.relationshipId)) as c (c.relationshipId)}
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
        <Button variant="outline" href="/social/messages?c={c.relationshipId}">Message {name.split(" ")[0]}</Button>
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

      {@const m = manage[c.relationshipId]}
      {#if m?.pausedUntil}
        <!-- E2: pinned while the coach has paused coaching. -->
        <section role="status" class="flex flex-col gap-2 rounded-[10px] border border-warning/40 bg-warning/5 px-[18px] py-4">
          <h2 class="text-sm font-semibold">{name} paused coaching until {weekdayDate(Date.parse(m.pausedUntil))}</h2>
          <dl class="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            {#if m.plan}<dt class="text-muted-foreground">Payments</dt><dd>Paused, next charge after {shortDate(Date.parse(m.pausedUntil))}</dd>{/if}
            <dt class="text-muted-foreground">Check-ins</dt><dd>Paused</dd>
            <dt class="text-muted-foreground">Your program</dt><dd>Keeps going as planned</dd>
          </dl>
          <p class="text-xs text-muted-foreground">{name} still sees what you share. You can stop coaching instead, below.</p>
        </section>
      {:else if m?.endsAt}
        <p role="status" class="rounded-[10px] bg-muted px-[18px] py-3 text-[13px]">Coaching with {name} ends {weekdayDate(Date.parse(m.endsAt))}. Your program and history stay yours.</p>
      {/if}
      {#if m?.change}
        {@const ch = m.change}
        <!-- K14: the coach suggests another package; nothing changes unless they accept. -->
        <section class="flex flex-col gap-3 rounded-[12px] border border-primary/40 bg-card px-[18px] py-4 shadow-sm">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name} suggests a different package</span>
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-1">
              <h2 class="text-[15px] font-semibold">{ch.packageName}</h2>
              {#each ch.packageDescription.split(/\n+/).filter(Boolean).slice(0, 3) as l (l)}<p class="text-[13px] text-muted-foreground">{l}</p>{/each}
            </div>
            {#if ch.pays}
              <div class="shrink-0 text-right"><p class="text-lg font-bold tabular-nums">{formatMoney(ch.amountCents, ch.currency)}</p><p class="text-xs text-muted-foreground">{ch.interval === "month" ? "a month" : ch.weeks ? `${ch.weeks} weeks` : "once"}</p></div>
            {/if}
          </div>
          <p class="text-[13px]">
            {#if !ch.pays}From {weekdayDate(Date.parse(ch.startsOn))} you'd pay {name} another way, not through LogIt.
            {:else if m.plan?.interval === "month" && ch.interval === "month"}From {weekdayDate(Date.parse(ch.startsOn))} your monthly payment becomes {formatMoney(ch.amountCents, ch.currency)}. Nothing is charged now.
            {:else}{m.plan?.interval === "month" ? "Your monthly plan stops renewing. " : ""}On {weekdayDate(Date.parse(ch.startsOn))} you pay {formatMoney(ch.amountCents, ch.currency)} for {ch.packageName}.{/if}
            It starts at your next payment, so you never pay twice.
          </p>
          <div class="flex flex-wrap gap-2">
            <Button disabled={busy === c.relationshipId} onclick={() => void answerChange(c, ch.offerId, true)}>Accept</Button>
            <Button variant="outline" disabled={busy === c.relationshipId} onclick={() => void answerChange(c, ch.offerId, false)}>Keep my package</Button>
          </div>
        </section>
      {/if}
      {#if m?.payDue}
        <section role="status" class="flex flex-wrap items-center gap-3 rounded-[12px] border border-warning/40 bg-warning/5 px-[18px] py-4">
          <span class="flex flex-[1_1_300px] flex-col gap-0.5">
            <h2 class="text-sm font-semibold">Time to pay for {m.payDue.packageName}</h2>
            <span class="text-[13px] text-muted-foreground">{formatMoney(m.payDue.amountCents, m.payDue.currency)}{m.payDue.interval === "month" ? " a month" : ""}, on Stripe's page. Coaching carries on once it's paid.</span>
          </span>
          <Button disabled={busy === c.relationshipId} onclick={() => void payChange(c)}>Pay {formatMoney(m.payDue.amountCents, m.payDue.currency)} ↗</Button>
        </section>
      {:else if m?.pendingPackage}
        <p class="rounded-[10px] bg-muted px-[18px] py-3 text-[13px]">You're moving to {m.pendingPackage}{m.plan?.paidUntil ? ` on ${weekdayDate(Date.parse(m.plan.paidUntil))}` : ""}.</p>
      {/if}
      {#if m?.quiet}
        <!-- Z2: the coach hasn't replied for a week. -->
        <section role="status" class="flex flex-col gap-2.5 rounded-[10px] border border-destructive/30 bg-destructive/5 px-[18px] py-4">
          <h2 class="text-sm font-semibold">{name} hasn't replied for {m.quiet.days} days</h2>
          {#if m.quiet.lastMessage}<p class="text-[13px] text-muted-foreground">Your last message{m.quiet.lastMessageAt ? `, ${shortDate(Date.parse(m.quiet.lastMessageAt))}` : ""}: "{m.quiet.lastMessage}"</p>{/if}
          <div class="flex flex-wrap gap-2">
            <Button size="sm" href="#messages-{c.relationshipId}">Message {name} again</Button>
            <Button size="sm" variant="outline" onclick={() => (stoppingQuiet = c)}>{m.plan ? "Stop and get a refund…" : "Stop coaching…"}</Button>
          </div>
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
            {#if m?.agreedAt}
              <div class="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[13px]">
                <span>{name}'s coaching agreement <span class="text-muted-foreground">· agreed {shortDate(Date.parse(m.agreedAt))}</span></span>
                <Button size="sm" variant="ghost" onclick={() => (readingAgreement = c.relationshipId)}>Read</Button>
              </div>
            {/if}
            {#if !m?.endsAt}
              <button type="button" onclick={() => (stopping = c)} class="mt-2.5 h-[34px] w-fit rounded-[9px] border border-destructive/45 px-3 text-[13px] text-destructive hover:bg-destructive/10">Stop coaching with {name}</button>
            {/if}
          </section>
        </div>
      </div>
    {/each}
    </div>
    </div>
  {/if}
</div>

<AlertDialog.Root open={stopping !== null} onOpenChange={(o) => { if (!o) stopping = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop coaching with {stopping ? coachName(stopping) : ""}?</AlertDialog.Title>
      {@const ends = stopping ? manage[stopping.relationshipId]?.plan : null}
      <AlertDialog.Description>
        {#if ends && ends.interval === "month" && ends.state === "paid" && ends.paidUntil && Date.parse(ends.paidUntil) > Date.now()}
          Your plan stops renewing. Coaching carries on until {shortDate(Date.parse(ends.paidUntil))}, the end of what you paid for. Your program, meal plan and history stay yours.
        {:else}
          They stop seeing your data straight away, and their program, check-ins and habits leave your app. Your own workouts and logs stay.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={stop}>Stop coaching</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={stoppingQuiet !== null} onOpenChange={(o) => { if (!o) stoppingQuiet = null; }}>
  <AlertDialog.Content>
    {@const q = stoppingQuiet ? manage[stoppingQuiet.relationshipId]?.quiet : null}
    <AlertDialog.Header>
      <AlertDialog.Title>Stop coaching with {stoppingQuiet ? coachName(stoppingQuiet) : ""}?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if q?.refundCents}{formatMoney(q.refundCents, (stoppingQuiet ? manage[stoppingQuiet.relationshipId]?.plan?.currency : null) ?? "eur")} for the days left goes back to your card, and your plan stops now. {/if}Your program and history are yours to keep. They're told "No reply for {q?.days ?? 7} days".
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void stopQuiet()}>{q?.refundCents ? `Stop and get ${formatMoney(q.refundCents, (stoppingQuiet ? manage[stoppingQuiet.relationshipId]?.plan?.currency : null) ?? "eur")} back` : "Stop coaching"}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

{#if readingAgreement && manage[readingAgreement]?.agreedText}
  {@const m = manage[readingAgreement]!}
  <AgreementDialog open={true} coach={m.coach.displayName || m.coach.username} text={m.agreedText!} agreedAt={m.agreedAt} />
{/if}

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
