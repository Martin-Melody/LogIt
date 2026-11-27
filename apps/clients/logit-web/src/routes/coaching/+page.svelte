<script lang="ts">
  import ClientHoverCard from "$lib/features/coaching/ClientHoverCard.svelte";
  import { onSampleActivity } from "$lib/features/guide/sampleActivity";
  import CoachStart from "$lib/features/onboarding/CoachStart.svelte";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { coachProblemText, needsCoach, type PaymentClient } from "@logit/core/domain/coachPayments";
  import { toast } from "$lib/components/ui/sonner";
  import { Button } from "$lib/components/ui/button";
  import { coachAway } from "$lib/features/coaching/away.svelte";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import {
    loadCoachingOverview,
    needsYou,
    type CoachingOverview,
    type NeedsYou,
  } from "$lib/features/coaching/coachingData";
  import { ago, daysBetween, weekdayDate, when } from "$lib/features/coaching/format";

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    try {
      overview = await loadCoachingOverview();
      coachBadges.fromOverview(overview);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your clients";
    }
  }
  onMount(load);
  onMount(() => void coachAway.load());
  // Payments that need the coach (failed, overdue, paused) belong here too, not only on the
  // Payments page (bug hunt 6.2). No payments set up: nothing to add.
  let payments = $state<PaymentClient[]>([]);
  // Canvas Z4: Stripe needs something (restricted, or details due), in Stripe's words.
  let stripeNeeds = $state<string | null | false>(false);
  onMount(async () => {
    try {
      const o = await coachPaymentsApi.overview();
      payments = needsCoach(o.clients);
      stripeNeeds = o.account.connected && (!o.account.ready || o.account.requirementsDue) && (o.account.requirementsDue || !!o.account.needs) ? (o.account.needs ?? null) : false;
    } catch { payments = []; }
  });
  onMount(() => onSampleActivity(() => void load()));

  const items = $derived(overview ? needsYou(overview) : []);
  const stats = $derived.by(() => {
    if (!overview) return null;
    const c = overview.clients;
    const sharing = c.filter((x) => x.sharing.workouts);
    const planned = sharing.reduce((n, x) => n + (x.program?.state === "running" ? x.program.daysPerWeek : 0), 0);
    return {
      active: c.length,
      invited: overview.sent.length + overview.requests.length,
      sessions: sharing.reduce((n, x) => n + x.sessions7d, 0),
      planned,
      toReview: c.reduce((n, x) => n + x.toReview.length, 0),
      missed: c.filter((x) => x.missed).length,
      unread: c.reduce((n, x) => n + x.unread, 0),
    };
  });

  const NUDGE = "Hi! Just a reminder your check-in is waiting. Fill it in when you get a minute.";

  function title(i: NeedsYou): string {
    switch (i.kind) {
      case "checkin": return `${i.client.name} sent a check-in`;
      case "message": return `${i.client.name} messaged you`;
      case "lasting-swap": return `${i.client.name} changed an exercise for the rest of the program`;
      case "waiting": return `${i.client.name} has waited ${i.days} days for a reply`;
      case "missed": {
        const late = daysBetween(i.dueMs, Date.now());
        return `${i.client.name}'s check-in is ${late <= 0 ? "due" : `${late} day${late === 1 ? "" : "s"} late`}`;
      }
      case "ending": return `${i.client.name}'s program ends ${when(i.program.endsAtMs!) === "today" ? "today" : `on ${weekdayDate(i.program.endsAtMs!)}`}`;
      case "request": {
        const n = i.request.client.displayName || i.request.client.username;
        return i.request.stage === "offered" ? `${n}'s offer ran out` : `${n} asked you to coach them`;
      }
    }
  }

  function detail(i: NeedsYou): string {
    switch (i.kind) {
      case "checkin": return `Check-in · ${ago(i.item.submittedAtMs)}`;
      case "message": return `${i.client.unread} unread`;
      case "lasting-swap": return "Keep it, or put it back";
      case "waiting": return i.days >= 7 ? "They can now stop coaching with a refund" : "After 7 days they can stop coaching with a refund";
      case "missed": return `${i.client.sessions7d} session${i.client.sessions7d === 1 ? "" : "s"} in the last 7 days`;
      case "ending": return `${i.program.program.name}, week ${i.program.week} of ${i.program.totalWeeks}`;
      case "request": return `${i.request.linkName ? `Via "${i.request.linkName}"` : "From your profile"} · ${ago(Date.parse(i.request.requestedAt))}`;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <header>
    <p class="mb-1 text-[13px] text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
    <h1 class="text-[26px] font-bold tracking-tight">Today</h1>
  </header>

  <!-- The Set up coaching card (CoachStart) replaces the Studio welcome card: it has Take the walkthrough (canvas T1). -->

  {#if overview}<CoachStart {overview} />{/if}

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview || !stats}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-[78px]" />{/each}
    </div>
    <Skeleton class="h-72" />
  {:else}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <a href="/clients" class="rounded-[10px] border border-border bg-card px-[18px] py-4 hover:bg-muted/40">
        <div class="text-xs text-muted-foreground">Active clients</div>
        <div class="mt-1 text-[22px] font-bold">{stats.active}{#if stats.invited}<span class="text-[13px] font-normal text-muted-foreground">{` +${stats.invited} waiting`}</span>{/if}</div>
      </a>
      <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="text-xs text-muted-foreground">Sessions, last 7 days</div>
        <div class="mt-1 text-[22px] font-bold">{stats.sessions}{#if stats.planned}<span class="text-[13px] font-normal text-muted-foreground">{` of ${stats.planned} planned`}</span>{/if}</div>
      </div>
      <a href="/coaching/checkins" class="rounded-[10px] border border-border bg-card px-[18px] py-4 hover:bg-muted/40">
        <div class="text-xs text-muted-foreground">Check-ins to review</div>
        <div class="mt-1 text-[22px] font-bold">{stats.toReview}{#if stats.missed}<span class="text-[13px] font-normal text-muted-foreground">{` ${stats.missed} missed`}</span>{/if}</div>
      </a>
      <a href="/messages" class="rounded-[10px] border border-border bg-card px-[18px] py-4 hover:bg-muted/40">
        <div class="text-xs text-muted-foreground">Unread messages</div>
        <div class="mt-1 text-[22px] font-bold">{stats.unread}</div>
      </a>
    </div>

    <div class="flex flex-wrap items-start gap-4">
      <section data-guide="today-needs-you" class="flex min-w-0 flex-[2_1_520px] flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex items-baseline justify-between pb-1">
          <h2 class="text-sm font-semibold">Needs you</h2>
          <span class="text-xs text-muted-foreground">Newest first</span>
        </div>
        {#if coachAway.value}
          {@const a = coachAway.value}
          <!-- Canvas Z7: a slim line while away (or planned). -->
          <div class="-mx-[18px] flex items-center gap-3 border-t border-border bg-muted/50 px-[18px] py-2.5 text-[13px]">
            <span class="flex-1">{a.now ? "You're away" : `Away from ${new Date(a.from).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}, back on {new Date(a.until).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Your note is pinned for clients.</span>
            <Button size="sm" variant="ghost" onclick={() => (coachAway.dialogOpen = true)}>Edit</Button>
            <Button size="sm" variant="outline" onclick={() => void coachAway.end().then(() => toast.success("You're back"))}>{a.now ? "End now" : "Cancel"}</Button>
          </div>
        {/if}
        {#if stripeNeeds !== false}
          <div class="flex items-center gap-3 border-t border-warning/40 bg-warning/5 -mx-[18px] px-[18px] py-3">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-[13px] font-medium">Stripe needs something from you</span>
              <span class="text-xs text-muted-foreground">Clients can't pay you until it's done, and payouts are on hold.{#if stripeNeeds}{" "}Stripe says: "{stripeNeeds}"{/if}</span>
            </span>
            <a href="/coaching/payments?tab=packages" class="h-8 shrink-0 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Finish in Stripe</a>
          </div>
        {/if}
        {#if items.length === 0 && payments.length === 0 && stripeNeeds === false}
          <p class="border-t border-border py-4 text-[13px] text-muted-foreground">
            {overview.clients.length === 0 ? "No clients yet. Invite someone from Clients, or share an invite link." : "Nothing waiting. Nice."}
          </p>
        {/if}
        {#each items as i, n (n)}
          {@const who = i.kind === "request" ? (i.request.client.displayName || i.request.client.username) : i.client.name}
          <div class="flex items-center gap-3 border-t border-border py-3">
            <Avatar name={who} url={i.kind === "request" ? i.request.client.avatarUrl : i.client.avatarUrl} />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-[13px] font-medium">{title(i)}</span>
              <span class="text-xs text-muted-foreground">{detail(i)}</span>
            </span>
            {#if i.kind === "checkin"}
              <a href="/coaching/checkins?id={encodeURIComponent(i.item.id)}&client={i.client.id}" class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Review</a>
            {:else if i.kind === "lasting-swap"}
              <a href="/clients/{i.client.id}?tab=training" class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Look</a>
            {:else if i.kind === "message" || i.kind === "waiting"}
              <a href="/messages?c={i.client.relationshipId}" class="h-8 rounded-[9px] {i.kind === 'waiting' ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border font-medium hover:bg-muted'} px-3 text-xs leading-8">Reply</a>
            {:else if i.kind === "missed"}
              <a href="/messages?c={i.client.relationshipId}&draft={encodeURIComponent(NUDGE)}" class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Nudge</a>
            {:else if i.kind === "ending"}
              <a href="/clients/{i.client.id}/next-block" class="h-8 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Plan next block</a>
            {:else}
              <a href="/clients?tab=requests&r={i.request.relationshipId}" class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">{i.request.stage === "offered" ? "Offer again" : "Answer"}</a>
            {/if}
          </div>
        {/each}
        {#each payments as c (c.relationshipId)}
          {@const who = c.client.displayName || c.client.username}
          <div class="flex items-center gap-3 border-t border-border py-3">
            <Avatar name={who} url={c.client.avatarUrl} />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-[13px] font-medium">{coachProblemText(c)}</span>
              <span class="text-xs text-muted-foreground">Payments</span>
            </span>
            <a href="/coaching/payments" class="h-8 shrink-0 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Open payments</a>
          </div>
        {/each}
      </section>

      <section data-guide="today-week" class="flex min-w-0 flex-[1_1_300px] flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex items-baseline justify-between pb-1">
          <h2 class="text-sm font-semibold">This week</h2>
          <span class="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        {#each overview.clients as c (c.relationshipId)}
          <a href="/clients/{c.id}?tab=training" class="flex items-center gap-3 border-t border-border py-3 hover:opacity-90">
            <Avatar name={c.name} url={c.avatarUrl} />
            <span class="flex min-w-0 flex-1 flex-col">
              <ClientHoverCard clientId={c.id} span class="w-fit text-[13px] font-medium">{c.name}</ClientHoverCard>
              {#if !c.sharing.workouts}
                <span class="text-xs text-muted-foreground">Doesn't share workouts</span>
              {:else if c.lastSessionAtMs && when(c.lastSessionAtMs) === "today"}
                <span class="text-xs text-success">Trained today</span>
              {:else}
                <span class="text-xs text-muted-foreground">{c.lastSessionAtMs ? `Last trained ${when(c.lastSessionAtMs)}` : "No workouts yet"}</span>
              {/if}
            </span>
            {#if c.sharing.workouts}
              <span class="text-[13px] tabular-nums text-muted-foreground">{c.sessions7d}{c.program?.state === "running" ? ` / ${c.program.daysPerWeek}` : ""}</span>
            {/if}
          </a>
        {:else}
          <p class="border-t border-border py-4 text-[13px] text-muted-foreground">Your clients show up here.</p>
        {/each}
      </section>
    </div>
  {/if}
</div>
