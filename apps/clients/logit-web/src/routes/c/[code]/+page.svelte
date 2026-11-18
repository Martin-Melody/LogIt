<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ApiError, apiClient } from "@logit/core/api/client";
  import { coachApi, SHARE_ALL, type InviteLinkInfo, type Sharing } from "@logit/core/api/coachApi";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import SharingSwitches from "$lib/features/coaching/SharingSwitches.svelte";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { formatMoney } from "@logit/core/domain/coachPayments";
  import GetTheApp from "$lib/features/onboarding/GetTheApp.svelte";

  const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";

  // Where a coach's invite link lands. Pick what the coach may see, then send a request
  // (or, if the coach already invited you by username, accept straight away). A link with a
  // package is paid: pay on Stripe's page, come back here, and coaching starts at once.
  // Paying only ever happens here on the web, never in the app.

  const code = $derived(page.params.code ?? "");
  let info = $state<InviteLinkInfo | null>(null);
  let error = $state<string | null>(null);
  let sharing = $state<Sharing>({ ...SHARE_ALL });
  let sending = $state(false);
  let done = $state<"requested" | "active" | "paid" | null>(null);
  let confirming = $state(false);

  // Free accounts land here without the sidebar; they keep using the app for everything else.
  const isFree = !apiClient.isSelfHosted() && apiClient.getUser()?.tier === "Free";

  onMount(async () => {
    const sessionId = page.url.searchParams.get("session_id");
    if (sessionId) {
      // Back from Stripe: start coaching now rather than waiting for Stripe's webhook.
      confirming = true;
      for (let i = 0; i < 5; i++) {
        try {
          const r = await coachPaymentsApi.confirmCheckout(code, sessionId);
          if (r.status === "active") {
            done = "paid";
            break;
          }
        } catch {
          /* try again */
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      confirming = false;
      history.replaceState(history.state, "", page.url.pathname);
    }
    try {
      info = await coachApi.openLink(code);
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This link doesn't exist. Check it with your coach." : e instanceof Error ? e.message : "Couldn't open the link";
    }
  });

  const coachName = $derived(info ? info.coach.displayName || info.coach.username : "");
  const pkg = $derived(info?.package ?? null);
  const included = $derived((pkg?.description ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean));

  async function pay() {
    if (!info || sending) return;
    sending = true;
    error = null;
    try {
      const here = `${location.origin}/c/${code}`;
      const { url } = await coachPaymentsApi.startCheckout(code, { sharing, successUrl: here, cancelUrl: here });
      location.href = url;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't open the payment page";
      sending = false;
    }
  }

  async function send() {
    if (!info || sending) return;
    sending = true;
    error = null;
    try {
      if (info.relationship === "invited" && info.relationshipId) {
        await coachApi.acceptInvite(info.relationshipId, sharing);
        done = "active";
      } else {
        done = (await coachApi.requestCoaching(code, sharing)).status;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't send the request";
    } finally {
      sending = false;
    }
  }

  const closedText = {
    off: "has been turned off",
    expired: "has expired",
    full: "has reached its limit",
  } as const;
</script>

<div class="mx-auto flex w-full max-w-md flex-col gap-4 py-6">
  {#if error && !info}
    <section class="rounded-[10px] border border-border bg-card p-5">
      <h1 class="text-lg font-bold">Invite link</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">{error}</p>
    </section>
  {:else if !info}
    <Skeleton class="h-80" />
  {:else}
    <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-5">
      <div class="flex items-center gap-3">
        <Avatar name={coachName} url={info.coach.avatarUrl} size={44} />
        <div>
          <h1 class="text-base font-bold">{info.isSelf ? "This is your own invite link" : pkg ? `Coaching with ${coachName}` : `${coachName} wants to coach you`}</h1>
          <p class="text-xs text-muted-foreground">@{info.coach.username} on LogIt</p>
        </div>
      </div>

      {#if info.isSelf}
        <p class="text-[13px] text-muted-foreground">Share it with people you'd like to coach. {pkg ? "They pay on this page, then coaching starts." : "Their requests show up in"} <a href="/coaching/links" class="text-primary hover:underline">Invite links</a>.</p>
      {:else if done === "paid"}
        <ol aria-label="Steps" class="flex gap-3.5 text-xs text-muted-foreground">
          <li class="flex items-center gap-1.5"><span class="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>Account</li>
          <li class="flex items-center gap-1.5"><span class="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>Pay</li>
          <li class="flex items-center gap-1.5 font-semibold text-foreground"><span class="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>Get the app</li>
        </ol>
        <p class="text-[13px] leading-relaxed">Paid, and {coachName} is now your coach. Get LogIt on your phone and log in with this account: your program, check-ins and messages are in My coach.</p>
        <a href={PLAY_URL} target="_blank" rel="noopener" class="h-11 rounded-[10px] bg-primary text-center text-sm font-bold leading-[44px] text-primary-foreground">Get LogIt on Google Play</a>
        <p class="text-xs text-muted-foreground">Stripe has emailed you a receipt.</p>
      {:else if confirming}
        <p class="text-[13px] text-muted-foreground">Checking your payment…</p>
      {:else if pkg && info.paying}
        <p class="text-[13px]">You already pay {coachName} through LogIt. Your plan is in My coach.</p>
      {:else if pkg && (info.relationship === "none" || info.relationship === "requested" || info.relationship === "paused")}
        {#if info.state !== "active"}
          <p class="text-[13px] text-muted-foreground">This link {closedText[info.state as keyof typeof closedText]}. Ask {coachName} for a new one.</p>
        {:else if !info.paymentsReady}
          <p class="text-[13px] text-muted-foreground">{coachName} can't take payments right now. Let them know, or ask for another link.</p>
        {:else}
          <ol aria-label="Steps" class="flex gap-3.5 text-xs text-muted-foreground">
            <li class="flex items-center gap-1.5"><span class="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>Account</li>
            <li class="flex items-center gap-1.5 font-semibold text-foreground"><span class="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>Pay</li>
            <li class="flex items-center gap-1.5"><span class="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold">3</span>Get the app</li>
          </ol>
          {#if info.relationship === "paused"}<p class="text-[13px]">Coaching with {coachName} is paused until it's paid. Paying restarts it straight away.</p>{/if}
          <div class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-background px-4 py-3.5">
            <div class="flex items-baseline justify-between gap-2.5">
              <h2 class="text-[15px] font-semibold">{pkg.name}</h2>
              <span class="whitespace-nowrap text-[15px] font-bold">{formatMoney(pkg.amountCents, pkg.currency)}<span class="text-xs font-medium text-muted-foreground">{pkg.interval === "month" ? " / month" : pkg.weeks ? ` · ${pkg.weeks} weeks` : " once"}</span></span>
            </div>
            {#if included.length > 1}
              <ul class="flex flex-col gap-1 text-[13px] leading-snug">{#each included as line, i (i)}<li class="flex gap-2"><span aria-hidden="true" class="text-muted-foreground">•</span>{line}</li>{/each}</ul>
            {:else if included.length}
              <p class="text-[13px] leading-relaxed">{included[0]}</p>
            {/if}
            <p class="text-xs leading-relaxed text-muted-foreground">
              {pkg.interval === "month" ? "Charged every month until you stop it. Stop any time in My coach, or ask " + coachName + "." : `Paid once. Coaching runs for ${pkg.weeks} weeks.`}
            </p>
          </div>
          <p class="text-[13px] font-semibold">What {coachName} can see <span class="font-normal text-muted-foreground">· change any time</span></p>
          <SharingSwitches {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
          <button type="button" disabled={sending} onclick={pay}
            class="h-12 rounded-[10px] bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50">
            {sending ? "Opening Stripe…" : `Pay ${formatMoney(pkg.amountCents, pkg.currency)} and start`}
          </button>
          <p class="text-center text-xs leading-relaxed text-muted-foreground">Card, Google Pay or Apple Pay on Stripe's secure page. You pay {coachName} directly; coaching starts as soon as it goes through.</p>
        {/if}
      {:else if done === "active" || info.relationship === "active" || done === "requested" || info.relationship === "requested"}
        {@const connected = done === "active" || info.relationship === "active"}
        <!-- W6: what happens next, with the app as the next step. -->
        <ol aria-label="What happens next" class="flex flex-col gap-3">
          <li class="flex items-center gap-3 text-sm">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">✓</span>
            {connected ? `Account made and connected to ${coachName}` : `Request sent: ${coachName} will say yes or no`}
          </li>
          <li class="flex items-center gap-3 text-sm font-semibold">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary text-[13px] font-bold">2</span>
            Get the app: {connected ? "your program will be waiting in it" : "you'll see them there once they accept"}
          </li>
          <li class="flex items-center gap-3 text-sm text-muted-foreground">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-[13px] font-bold">3</span>
            Pick your training days and start week 1
          </li>
        </ol>
        {#if !isFree}
          <a href="/my-coach" class="text-[13px] text-primary hover:underline">{connected ? "Open My coach on the web ›" : "Change what you share or cancel the request in My coach ›"}</a>
        {/if}
      {:else if info.state !== "active" && info.relationship !== "invited"}
        <p class="text-[13px] text-muted-foreground">This link {closedText[info.state]}. Ask {coachName} for a new one.</p>
      {:else}
        <p class="text-[13px] leading-relaxed text-muted-foreground">
          {info.relationship === "invited" ? `${coachName} already invited you. ` : ""}Pick what {coachName} can see. You can change this any time in My coach.
        </p>
        <SharingSwitches {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
        {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
        <button type="button" disabled={sending} onclick={send}
          class="h-10 rounded-[9px] bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
          {info.relationship === "invited" ? `Accept ${coachName} as my coach` : `Send request to ${coachName}`}
        </button>
      {/if}
    </section>
    {#if !info.isSelf && (done === "active" || done === "requested" || info.relationship === "active" || info.relationship === "requested")}
      <GetTheApp title="Get Logit on your phone">
        <span class="text-[13px] text-slate-400">{coachName}'s program, check-ins and messages all live in the app.</span>
      </GetTheApp>
    {/if}
    {#if isFree}<p class="text-center text-xs text-muted-foreground">Coaching works on the free plan. Everything happens in the LogIt app.</p>{/if}
  {/if}
</div>
