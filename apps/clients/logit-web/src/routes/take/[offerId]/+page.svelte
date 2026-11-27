<!-- Take the spot (canvas J1), then "You're coached by Sam" (J2). Opened from an offer's
     "Take the spot" on the web or the phone. Agree to the coach's agreement (if they wrote one),
     choose what they see, confirm 18+ to pay, then Stripe's page or straight in. Its own page,
     open to every plan: being coached is free. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi, type Sharing, type TakeInfo } from "@logit/core/api/coachApi";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import { firstName } from "@logit/core/domain/coachRequest";
  import type { CheckinSchedule } from "@logit/core/domain/Checkin";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import RichText from "@logit/ui/RichText.svelte";
  import Logo from "@logit/ui/Logo.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import SharingSwitches from "$lib/features/coaching/SharingSwitches.svelte";
  import AgreementDialog from "$lib/features/coaching/requests/AgreementDialog.svelte";
  import { loadAssignedForms, loadAssignedPrograms } from "$lib/features/coaching/myCoachData";
  import GetTheApp from "$lib/features/onboarding/GetTheApp.svelte";

  const offerId = $derived(page.params.offerId ?? "");
  let info = $state<TakeInfo | null>(null);
  let error = $state<string | null>(null);
  let sharing = $state<Sharing | null>(null);
  let agreed = $state(false);
  let adult = $state(false);
  let reading = $state(false);
  let busy = $state(false);
  let confirming = $state(false);
  let started = $state(false);
  let programs = $state<CoachProgram[]>([]);
  let forms = $state<CheckinSchedule[]>([]);
  const onIphone = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const coach = $derived(info ? info.coach.displayName || info.coach.username : "");
  const regularForms = $derived(forms.filter((f) => f.kind !== "startup"));
  const startupForm = $derived(forms.find((f) => f.kind === "startup" && !f.archived) ?? null);
  const c = $derived(firstName(coach));
  const o = $derived(info?.offer ?? null);
  const pays = $derived(!!o?.pays);
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // "Starts today · renews 3 Jan" / "Starts Mon 1 Dec · first charge 1 Jan".
  const when = $derived.by(() => {
    if (!o) return "";
    const startMs = o.startsOnMs && o.startsOnMs > Date.now() ? o.startsOnMs : null;
    const start = startMs ? `Starts ${day(startMs)}` : "Starts today";
    if (!o.pays) return start;
    if (o.interval !== "month") return `${start}${o.weeks ? ` · ${o.weeks} weeks` : ""} · paid once`;
    // Starting later without a set first charge: the first charge is the start date.
    const firstCharge = o.firstChargeOnMs ?? startMs;
    if (firstCharge) return `${start} · first charge ${day(firstCharge)}`;
    const renew = new Date(startMs ?? Date.now());
    renew.setMonth(renew.getMonth() + 1);
    return `${start} · renews ${day(renew.getTime())}`;
  });

  async function load() {
    try {
      info = await coachApi.takeInfo(offerId);
      sharing ??= info.sharing;
      error = null;
    } catch {
      error = "This offer isn't yours, or it doesn't exist any more. Open it again from your conversation.";
    }
  }

  async function welcome() {
    started = true;
    [programs, forms] = await Promise.all([loadAssignedPrograms().catch(() => []), loadAssignedForms().catch(() => [])]);
  }

  onMount(async () => {
    const sessionId = page.url.searchParams.get("session_id");
    if (sessionId) {
      // Back from Stripe: start coaching now rather than waiting for Stripe's webhook.
      confirming = true;
      for (let i = 0; i < 5; i++) {
        try {
          if ((await coachApi.confirmOfferCheckout(offerId, sessionId)).status === "active") break;
        } catch {
          /* try again */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      confirming = false;
      history.replaceState(history.state, "", page.url.pathname);
    }
    await load();
    if (info?.relationship === "active") await welcome();
  });

  async function take() {
    if (!info || !sharing || busy) return;
    busy = true;
    error = null;
    try {
      if (pays) {
        const here = `${location.origin}/take/${offerId}`;
        const { url } = await coachApi.checkoutOffer(offerId, { sharing, agreed, adult, successUrl: here, cancelUrl: here });
        location.href = url;
        return;
      }
      await coachApi.takeOffer(offerId, sharing, agreed);
      await load();
      await welcome();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't take the spot. Try again.";
    } finally {
      busy = false;
    }
  }

  // Stripe can only hold a charge from two days ahead; a nearer date is charged now.
  const chargeLater = $derived.by(() => {
    if (!o || o.interval !== "month") return null;
    const at = o.firstChargeOnMs ?? (o.startsOnMs && o.startsOnMs > Date.now() ? o.startsOnMs : null);
    return at && at > Date.now() + 2 * 86_400_000 ? at : null;
  });
  const needsAgreement = $derived(!!info?.agreement);
  const ready = $derived(!!info && (!needsAgreement || agreed) && (!pays || adult) && (!pays || info.paymentsReady));
</script>

<svelte:head><title>{coach ? `Start coaching with ${coach}` : "Take the spot"} · LogIt</title></svelte:head>

<header class="flex h-[52px] items-center justify-between border-b border-border px-4">
  <a href="/my-coach" class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</a>
  {#if apiClient.isAuthenticated()}<span class="truncate text-xs text-muted-foreground">Signed in as {apiClient.getUser()?.displayName || apiClient.getUser()?.username}</span>{/if}
</header>

<main class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
  {#if confirming}
    <section class="rounded-[12px] border border-border bg-card p-5"><p class="text-[14px] text-muted-foreground" aria-live="polite">Checking your payment…</p></section>
  {:else if error && !info}
    <section class="flex flex-col gap-3 rounded-[12px] border border-border bg-card p-5">
      <h1 class="text-lg font-bold">Take the spot</h1>
      <p class="text-[13px] text-muted-foreground">{error}</p>
      <Button variant="outline" href="/my-coach" class="self-start">Open My coach</Button>
    </section>
  {:else if !info || !o || !sharing}
    <Skeleton class="h-[520px]" />
  {:else if started}
    <!-- J2: what's actually set up, nothing promised that isn't. -->
    <section class="flex flex-col gap-4 rounded-[12px] border border-border bg-card p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon class="size-5" aria-hidden="true" /></span>
        <div>
          <h1 class="text-lg font-bold">You're coached by {c}</h1>
          <p class="text-xs text-muted-foreground">
            {o.pays ? (chargeLater ? `First charge ${day(chargeLater)} · ${formatMoney(o.amountCents, o.currency)} a month` : `${formatMoney(o.amountCents, o.currency)} paid · receipt sent to your email`) : "No payment through LogIt"}
          </p>
        </div>
      </div>
      {#if startupForm}
        <!-- J3: the coach needs it before the program starts. -->
        <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-primary/40 bg-primary/5 px-4 py-3">
          <span class="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
            <span class="text-sm font-semibold">{c}'s start-up form</span>
            <span class="text-xs text-muted-foreground">{startupForm.questions.filter((q) => q.type !== "heading").length} questions. {c} needs it before your program starts.</span>
          </span>
          <Button href="/my-coach/checkin/{startupForm.id}">Fill it in</Button>
        </div>
      {/if}
      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">What happens next</h2>
        <ul class="flex flex-col divide-y divide-border rounded-[10px] border border-border text-[13px]">
          <li class="flex flex-col gap-0.5 px-3.5 py-2.5">
            <span class="font-medium">Program</span>
            <span class="text-muted-foreground">{programs.length ? `${programs[0]!.name} is ready.` : `Not sent yet. You'll get a notification when ${c} sends it.`}</span>
          </li>
          <li class="flex flex-col gap-0.5 px-3.5 py-2.5">
            <span class="font-medium">Check-ins</span>
            <span class="text-muted-foreground">{regularForms.length ? `${regularForms[0]!.name}: ${c} set it up for you.` : `${c} hasn't set one up yet.`}</span>
          </li>
        </ul>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button href="/my-coach">Message {c}</Button>
        <Button variant="outline" href="/my-coach">Open My coach</Button>
      </div>
    </section>
    <GetTheApp title="Get LogIt on your phone">
      <span class="text-[13px] text-slate-400">{c}'s program, check-ins and messages live in the app.</span>
    </GetTheApp>
  {:else if info.state !== "open"}
    <section class="flex flex-col gap-3 rounded-[12px] border border-border bg-card p-5">
      <h1 class="text-lg font-bold">This offer isn't open</h1>
      <p class="text-[13px] text-muted-foreground">
        {info.state === "expired" ? `It ran out on ${day(o.holdUntilMs)}. Ask ${c} in your conversation if the spot is still free.`
          : info.state === "replaced" ? `${c} changed the offer. Open the new one from your conversation.`
          : info.state === "taken" ? `You've taken it already.` : `${c} withdrew it. Your request is still open.`}
      </p>
      <Button variant="outline" href="/my-coach?request={info.relationshipId}" class="self-start">Open the conversation</Button>
    </section>
  {:else}
    <section class="flex flex-col gap-5 rounded-[12px] border border-border bg-card p-5">
      <div class="flex items-center gap-3">
        <Avatar name={coach} url={info.coach.avatarUrl} size={44} />
        <div><h1 class="text-lg font-bold">Start coaching with {c}</h1><p class="text-xs text-muted-foreground">From the offer in your conversation</p></div>
      </div>

      <div class="flex items-start justify-between gap-3 rounded-[10px] border border-border bg-background px-4 py-3.5">
        <div class="flex min-w-0 flex-col gap-0.5">
          <h2 class="text-[15px] font-semibold">{o.packageName}</h2>
          <p class="text-xs text-muted-foreground">{when}</p>
        </div>
        {#if o.pays}
          <p class="shrink-0 text-right text-lg font-bold tabular-nums">{formatMoney(o.amountCents, o.currency)}<span class="block text-xs font-normal text-muted-foreground">{o.interval === "month" ? "a month" : "once"}</span></p>
        {:else}
          <p class="shrink-0 text-right text-[13px] text-muted-foreground">No payment<br />through LogIt</p>
        {/if}
      </div>

      {#if info.otherCoach}
        <div role="note" class="flex flex-col gap-1 rounded-[10px] border border-warning/40 bg-warning/8 px-4 py-3">
          <p class="text-[13px] font-semibold">This ends coaching with {info.otherCoach.name}</p>
          <p class="text-xs leading-relaxed">
            You can have one coach at a time. {info.otherCoach.paidUntil
              ? `${firstName(info.otherCoach.name)}'s plan stops renewing; you keep coaching with ${firstName(info.otherCoach.name)} until ${shortDay(info.otherCoach.paidUntil)}, the end of what you paid for.`
              : `Coaching with ${firstName(info.otherCoach.name)} ends when you take this spot.`} Your program and history stay yours.
          </p>
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">What {c} can see <span class="font-normal text-muted-foreground">· change it any time in My coach</span></h2>
        <SharingSwitches {sharing} disabled={busy} onchange={(s) => (sharing = s)} />
      </div>

      {#if info.agreement}
        <div class="flex flex-col gap-2">
          <h2 class="text-sm font-semibold">{c}'s coaching agreement</h2>
          <div class="relative max-h-32 overflow-hidden rounded-[10px] bg-muted/50 px-3.5 py-2.5">
            <RichText text={info.agreement.text} class="text-[13px] leading-relaxed" />
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-muted/90 to-transparent"></div>
          </div>
          <Button variant="outline" size="sm" class="self-start" onclick={() => (reading = true)}>Read all of it</Button>
          <label class="flex items-start gap-2.5 pt-1">
            <Checkbox bind:checked={agreed} class="mt-0.5" />
            <span class="text-[13px]">I agree to {c}'s coaching agreement<span class="block text-xs text-muted-foreground">{c} wrote this, not LogIt.</span></span>
          </label>
        </div>
      {/if}

      {#if pays}
        <label class="flex items-start gap-2.5">
          <Checkbox bind:checked={adult} class="mt-0.5" />
          <span class="text-[13px]">I'm 18 or over<span class="block text-xs text-muted-foreground">Paying needs you to be 18 or over. Under 18? {c} can coach you with payment sorted outside LogIt.</span></span>
        </label>
        {#if !info.paymentsReady}<p class="text-[13px] text-destructive">{c} can't take payments right now. Let {c} know in your conversation.</p>{/if}
      {/if}

      {#if onIphone}
        <div role="note" class="rounded-[10px] bg-muted px-3.5 py-2.5 text-xs leading-relaxed">
          <b class="font-semibold">You're on an iPhone.</b> {c}'s program can only be logged in LogIt's Android app for now. Messages, check-ins and food work in your browser.
        </div>
      {/if}

      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
      <Button size="lg" class="h-12 text-[15px] font-bold" disabled={!ready || busy} onclick={() => void take()}>
        {busy ? (pays ? "Opening Stripe…" : "Starting…") : pays ? `Pay ${formatMoney(o.amountCents, o.currency)}` : "Take the spot"}
      </Button>
      {#if pays}
        <p class="text-center text-xs leading-relaxed text-muted-foreground">
          Next is Stripe's payment page (card, Google Pay). The money goes to {c}. Then you come back here.{chargeLater ? ` You're not charged until ${day(chargeLater)}.` : ""}
        </p>
      {/if}
    </section>
  {/if}
</main>

{#if info?.agreement}
  <AgreementDialog bind:open={reading} coach={c} text={info.agreement.text} changedAt={info.agreement.changedAt} onagree={() => (agreed = true)} />
{/if}
