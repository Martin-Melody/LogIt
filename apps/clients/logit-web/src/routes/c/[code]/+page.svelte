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
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import Logo from "@logit/ui/Logo.svelte";
  import { Button } from "$lib/components/ui/button";
  import AskForm from "$lib/features/coaching/ask/AskForm.svelte";
  import AskSent from "$lib/features/coaching/ask/AskSent.svelte";
  import { shortDate } from "$lib/features/coaching/format";

  const PLAY_URL = "https://play.google.com/store/apps/details?id=ie.logit.app";

  // Where a coach's invite link lands. A free link asks the coach's questions (canvas P2, the
  // same form as asking from their profile); if the coach already invited you by username,
  // accepting is straight away. A link with a package is paid: pay on Stripe's page, come back
  // here, and coaching starts at once. Paying only ever happens on the web, never in the app.

  const code = $derived(page.params.code ?? "");
  let info = $state<InviteLinkInfo | null>(null);
  let error = $state<string | null>(null);
  let sharing = $state<Sharing>({ ...SHARE_ALL });
  let sending = $state(false);
  let done = $state<"requested" | "active" | "paid" | null>(null);
  let asked = $state<{ relationshipId: string; waiting: boolean } | null>(null);
  let answers = $state<Record<string, string>>({});
  let interested = $state<string | null>(null);
  let confirming = $state(false);

  // Its own page (no dashboard around it), signed in or not: people open these from a
  // coach's bio on their phone, often before they have an account.
  let signedIn = $state(apiClient.isAuthenticated());
  const myName = $derived(signedIn ? apiClient.getUser()?.displayName || apiClient.getUser()?.username || "" : "");
  // Free accounts keep using the app for everything else.
  const isFree = $derived(signedIn && !apiClient.isSelfHosted() && apiClient.getUser()?.tier === "Free");
  const signInHref = $derived(`/login?next=${encodeURIComponent(`/c/${code}`)}`);

  // Sign-up right here: name, email, password (the server makes a username from the name).
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let signingUp = $state(false);
  let signUpError = $state<string | null>(null);
  let inviteOnly = $state(false);

  async function signUp(e: SubmitEvent) {
    e.preventDefault();
    if (signingUp) return;
    signingUp = true;
    signUpError = null;
    try {
      await apiClient.register("", email.trim(), password, name.trim());
      signedIn = true;
      info = await coachApi.openLink(code);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "invite_required" || err.code === "invite_invalid")) inviteOnly = true;
      else if (err instanceof ApiError && err.status === 409) signUpError = "That email already has an account. Sign in instead.";
      else signUpError = err instanceof Error ? err.message : "Couldn't create your account. Try again.";
    } finally {
      signingUp = false;
    }
  }

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

  async function ask(a: Record<string, string>, pkg: string | null) {
    const r = await coachApi.requestCoaching(code, SHARE_ALL, a, pkg);
    if (r.status === "active") done = "active";
    else asked = { relationshipId: r.relationshipId, waiting: r.stage === "waiting" };
  }

  async function signedInNow() {
    signedIn = true;
    info = await coachApi.openLink(code);
    if (info.relationship !== "none" && info.relationship !== "invited")
      throw new Error(info.relationship === "requested" ? `You've already asked ${coachName}. Your request is in My coach.` : `You're already connected to ${coachName}: see My coach.`);
  }

  const first = $derived(coachName.trim().split(/\s+/)[0] || coachName);
  // Canvas A4 / R1: the coach is full and stopped taking requests.
  const stopped = $derived(!!info?.spots?.full && info.spots.whenFull === "stop");

  const closedText = {
    off: "has been turned off",
    expired: "has expired",
    full: "has reached its limit",
  } as const;
</script>

{#snippet packageCard(p: NonNullable<InviteLinkInfo["package"]>)}
  <div class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-background px-4 py-3.5">
    <div class="flex items-baseline justify-between gap-2.5">
      <h2 class="text-[15px] font-semibold">{p.name}</h2>
      <span class="whitespace-nowrap text-[15px] font-bold">{formatMoney(p.amountCents, p.currency)}<span class="text-xs font-medium text-muted-foreground">{p.interval === "month" ? " / month" : p.weeks ? ` · ${p.weeks} weeks` : " once"}</span></span>
    </div>
    {#if included.length > 1}
      <ul class="flex flex-col gap-1 text-[13px] leading-snug">{#each included as line, i (i)}<li class="flex gap-2"><span aria-hidden="true" class="text-muted-foreground">•</span>{line}</li>{/each}</ul>
    {:else if included.length}
      <p class="text-[13px] leading-relaxed">{included[0]}</p>
    {/if}
    <p class="text-xs leading-relaxed text-muted-foreground">
      {p.interval === "month" ? "Charged every month until you stop it. Stop any time in My coach, or ask " + coachName + "." : `Paid once. Coaching runs for ${p.weeks} weeks.`}
    </p>
  </div>
{/snippet}

{#snippet askHere()}
  {#if stopped}
    <p class="text-[14px]">{first} isn't taking new clients right now.{info?.spots?.expectSpots ? ` ${first} expects spots in ${info.spots.expectSpots}.` : ""}</p>
  {:else}
    <div class="flex flex-col gap-1">
      <h2 class="text-lg font-bold tracking-tight">{info?.spots?.full ? `Join ${first}'s waiting list` : `Ask ${first} to coach you`}</h2>
      <p class="text-[13px] text-muted-foreground">{first} reads these before replying. Only {first} sees your answers.</p>
    </div>
    <AskForm coachName={coachName} questions={info?.questions ?? []} bind:answers bind:interested {signedIn}
      waitingList={!!info?.spots?.full} onsignedin={signedInNow} onsend={ask} />
  {/if}
{/snippet}

{#snippet linkOff()}
  <!-- R1: a switched-off link is just the coach's profile, with no package picked. -->
  <p class="text-[14px] text-muted-foreground">This link isn't active any more. You can still ask {first} from their profile.</p>
  <Button href="/ask/{info?.coach.username}" class="self-start">Ask to be coached</Button>
{/snippet}

{#snippet steps(at: 1 | 2 | 3)}
  <ol aria-label="Steps" class="flex gap-3.5 text-xs text-muted-foreground">
    {#each ["Account", "Pay", "Get the app"] as label, i (label)}
      <li class="flex items-center gap-1.5 {i + 1 === at ? 'font-semibold text-foreground' : ''}">
        {#if i + 1 < at}<span class="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-bold text-success">✓</span>
        {:else}<span class="flex size-5 items-center justify-center rounded-full text-[11px] font-bold {i + 1 === at ? 'bg-primary text-primary-foreground' : 'bg-muted'}">{i + 1}</span>{/if}
        {label}
      </li>
    {/each}
  </ol>
{/snippet}

<header class="flex h-[52px] items-center justify-between border-b border-border px-4">
  <span class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</span>
  {#if signedIn}
    <span class="truncate text-xs text-muted-foreground">Signed in as {myName}</span>
  {:else}
    <a href={signInHref} class="inline-flex h-8 items-center rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-muted">Sign in</a>
  {/if}
</header>
<div class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
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
          <h1 class="text-base font-bold">{info.isSelf ? "This is your own invite link" : pkg ? `Coaching with ${coachName}` : coachName}</h1>
          <p class="text-xs text-muted-foreground">@{info.coach.username} on LogIt</p>
        </div>
      </div>

      {#if info.isSelf}
        <p class="text-[13px] text-muted-foreground">Share it with people you'd like to coach. {pkg ? "They pay on this page, then coaching starts." : "Their requests show up in"} <a href="/coaching/links" class="text-primary hover:underline">Invite links</a>.</p>
      {:else if asked}
        <AskSent coachName={coachName} relationshipId={asked.relationshipId} waiting={asked.waiting} />
      {:else if !signedIn}
        {#if info.state !== "active"}
          {@render linkOff()}
        {:else if pkg && !info.paymentsReady}
          <p class="text-[13px] text-muted-foreground">{coachName} can't take payments right now. Let them know, or ask for another link.</p>
        {:else if !pkg}
          {@render askHere()}
        {:else}
          {#if pkg}{@render packageCard(pkg)}{/if}
          {#if pkg}{@render steps(1)}{/if}
          {#if inviteOnly}
            <p class="text-[13px] leading-relaxed">This LogIt server needs an invite code to sign up.</p>
            <a href={signInHref} class="h-11 rounded-[10px] bg-primary text-center text-sm font-bold leading-[44px] text-primary-foreground">Sign up with an invite code</a>
          {:else}
            <form onsubmit={signUp} class="flex flex-col gap-3">
              <h2 class="text-[15px] font-semibold">{pkg ? "Make your free LogIt account" : `Make a free LogIt account to ask ${coachName} to coach you`}</h2>
              <div class="flex flex-col gap-1.5"><Label for="su-name">Name</Label><Input id="su-name" bind:value={name} autocomplete="name" required /></div>
              <div class="flex flex-col gap-1.5"><Label for="su-email">Email</Label><Input id="su-email" type="email" bind:value={email} autocomplete="email" required /></div>
              <div class="flex flex-col gap-1.5"><Label for="su-password">Password</Label><Input id="su-password" type="password" bind:value={password} autocomplete="new-password" required /></div>
              {#if signUpError}<p class="text-xs text-destructive">{signUpError}</p>{/if}
              <button type="submit" disabled={signingUp || !name.trim() || !email.trim() || !password}
                class="h-12 rounded-[10px] bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50">
                {signingUp ? "Creating your account…" : "Create account and continue"}
              </button>
            </form>
            <p class="text-center text-[13px] text-muted-foreground">Already on LogIt? <a href={signInHref} class="font-semibold text-foreground underline underline-offset-4">Sign in</a></p>
          {/if}
          {#if pkg}<p class="text-center text-xs leading-relaxed text-muted-foreground">Next you pay {coachName} directly on Stripe's secure page. LogIt never sees your card.</p>{/if}
        {/if}
      {:else if done === "paid"}
        {@render steps(3)}
        <p class="text-[13px] leading-relaxed">Paid, and {coachName} is now your coach. Get LogIt on your phone and sign in with {email.trim() || "this account"}: your program, check-ins and messages are in My coach.</p>
        <a href={PLAY_URL} target="_blank" rel="noopener" class="h-11 rounded-[10px] bg-primary text-center text-sm font-bold leading-[44px] text-primary-foreground">Get LogIt on Google Play</a>
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
          {@render steps(2)}
          {#if info.relationship === "paused"}<p class="text-[13px]">Coaching with {coachName} is paused until it's paid. Paying restarts it straight away.</p>{/if}
          {@render packageCard(pkg)}
          <p class="text-[13px] font-semibold">What {coachName} can see <span class="font-normal text-muted-foreground">· change any time</span></p>
          <SharingSwitches {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
          <button type="button" disabled={sending} onclick={pay}
            class="h-12 rounded-[10px] bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50">
            {sending ? "Opening Stripe…" : `Pay ${formatMoney(pkg.amountCents, pkg.currency)} and start`}
          </button>
          <p class="text-center text-xs leading-relaxed text-muted-foreground">Card, Google Pay or Apple Pay on Stripe's secure page. You pay {coachName} directly. Got a discount code from {coachName}? Enter it there.</p>
        {/if}
      {:else if info.relationship === "active" && done !== "active"}
        <!-- R1: already this coach's client. The link's package isn't offered again. -->
        <p class="text-[14px]">You're coached by {first}{info.coachedSince ? ` since ${shortDate(Date.parse(info.coachedSince))}` : ""}.</p>
        <div class="flex gap-2"><Button href="/my-coach">Open My coach</Button><Button variant="outline" href="/my-coach">Message {first}</Button></div>
        <p class="text-xs text-muted-foreground">Changing package is a conversation with {first}.</p>
      {:else if info.relationship === "requested" && !pkg && info.relationshipId}
        <p class="text-[14px]">You've asked {first} already{info.stage === "waiting" ? ", and you're on the waiting list" : ""}.</p>
        <Button href="/social/messages?c={info.relationshipId}">Open the conversation</Button>
      {:else if done === "active" || done === "requested"}
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
        {@render linkOff()}
      {:else if info.relationship !== "invited"}
        {@render askHere()}
      {:else}
        <p class="text-[13px] leading-relaxed text-muted-foreground">
          {coachName} already invited you. Pick what {coachName} can see. You can change this any time in My coach.
        </p>
        <SharingSwitches {sharing} disabled={sending} onchange={(s) => (sharing = s)} />
        {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
        <button type="button" disabled={sending} onclick={send}
          class="h-10 rounded-[9px] bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
          Accept {coachName} as my coach
        </button>
      {/if}
    </section>
    {#if signedIn && !info.isSelf && done !== "paid" && (done === "active" || asked)}
      <GetTheApp title="Get LogIt on your phone">
        <span class="text-[13px] text-slate-400">{coachName}'s program, check-ins and messages all live in the app.</span>
      </GetTheApp>
    {/if}
    {#if isFree}<p class="text-center text-xs text-muted-foreground">Coaching works on the free plan. Everything happens in the LogIt app.</p>{/if}
    {#if info.otherCoach && info.relationship !== "active"}<p class="text-center text-xs text-muted-foreground">You're coached by {info.otherCoach}</p>{/if}
  {/if}
</div>
