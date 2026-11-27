<!-- Ask a coach from their profile (canvas P2, K7, A4, R1). Its own page, signed in or not,
     like an invite link: people tap "Ask to be coached" on getlogit.app/@name before they have
     an account. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { ApiError, apiClient } from "@logit/core/api/client";
  import { coachApi, SHARE_ALL, type AskInfo } from "@logit/core/api/coachApi";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import AskForm from "$lib/features/coaching/ask/AskForm.svelte";
  import AskSent from "$lib/features/coaching/ask/AskSent.svelte";
  import { shortDate } from "$lib/features/coaching/format";
  import GetTheApp from "$lib/features/onboarding/GetTheApp.svelte";
  import Logo from "@logit/ui/Logo.svelte";

  const username = $derived(page.params.username ?? "");
  let info = $state<AskInfo | null>(null);
  let error = $state<string | null>(null);
  let signedIn = $state(apiClient.isAuthenticated());
  let answers = $state<Record<string, string>>({});
  let interested = $state<string | null>(null);
  let sent = $state<{ relationshipId: string; waiting: boolean } | null>(null);

  // Canvas L1: opened from one of the coach's links (?l=CODE). Asking goes through it, so the
  // coach sees where they came from, with the link's package picked.
  let linkCode = $state<string | null>(null);

  async function load() {
    try {
      info = await coachApi.askInfo(username);
      const l = page.url.searchParams.get("l");
      if (l) {
        const link = await coachApi.openLink(l).catch(() => null);
        if (link && link.state === "active" && link.coach.username === info.coach.username && !link.package) {
          linkCode = l;
          interested ??= link.pickedPackageId ?? null;
        }
      }
      error = null;
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? `@${username} isn't coaching on LogIt.` : e instanceof Error ? e.message : "Couldn't open this page";
    }
  }
  onMount(load);

  const name = $derived(info ? info.coach.displayName || info.coach.username : "");
  const first = $derived(name.trim().split(/\s+/)[0] || name);
  const stopped = $derived(!!info?.full && info.whenFull === "stop");

  async function send(a: Record<string, string>, pkg: string | null) {
    const r = linkCode ? await coachApi.requestCoaching(linkCode, SHARE_ALL, a, pkg) : await coachApi.ask(username, a, pkg, SHARE_ALL);
    sent = { relationshipId: r.relationshipId, waiting: r.stage === "waiting" };
  }

  async function signedInNow() {
    signedIn = true;
    // Who they are changes what this page says (already coached, already asked…).
    await load();
    if (info && info.relationship !== "none") throw new Error(info.relationship === "requested" ? `You've already asked ${first}. Your request is in My coach.` : `You're already connected to ${first}: see My coach.`);
  }
</script>

<svelte:head><title>{info ? `Ask ${name} to coach you` : "Ask to be coached"} · LogIt</title></svelte:head>

<header class="flex h-[52px] items-center justify-between border-b border-border px-4">
  <a href="/" class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</a>
  {#if signedIn}
    <span class="truncate text-xs text-muted-foreground">Signed in as {apiClient.getUser()?.displayName || apiClient.getUser()?.username}</span>
  {/if}
</header>

<main class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
  {#if error}
    <section class="rounded-[12px] border border-border bg-card p-5">
      <h1 class="text-lg font-bold">Ask to be coached</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">{error}</p>
    </section>
  {:else if !info}
    <Skeleton class="h-96" />
  {:else}
    <section class="flex flex-col gap-5 rounded-[12px] border border-border bg-card p-5">
      <div class="flex items-center gap-3">
        <Avatar name={name} url={info.coach.avatarUrl} size={44} />
        <div class="min-w-0">
          <p class="truncate text-[15px] font-bold">{name}</p>
          <p class="truncate text-xs text-muted-foreground">@{info.coach.username}</p>
        </div>
      </div>

      {#if sent}
        <AskSent coachName={name} relationshipId={sent.relationshipId} waiting={sent.waiting} />
      {:else if info.isSelf}
        <p class="text-[14px] leading-relaxed">This is the page people see when they tap "Ask to be coached" on your profile.</p>
        <Button variant="outline" href="/coaching/profile">Your coaching profile</Button>
      {:else if info.relationship === "active"}
        <!-- R1: already this coach's client. -->
        <p class="text-[14px]">You're coached by {first}{info.coachedSince ? ` since ${shortDate(Date.parse(info.coachedSince))}` : ""}.</p>
        <div class="flex gap-2"><Button href="/my-coach">Open My coach</Button><Button variant="outline" href="/my-coach">Message {first}</Button></div>
        <p class="text-xs text-muted-foreground">Changing package is a conversation with {first}.</p>
      {:else if info.relationship === "requested" && info.relationshipId}
        <p class="text-[14px]">You've asked {first} already{info.stage === "waiting" ? ", and you're on the waiting list" : ""}.</p>
        <Button href="/my-coach?request={info.relationshipId}">Open the conversation</Button>
      {:else if info.relationship === "invited"}
        <p class="text-[14px]">{first} already invited you. Accept it in My coach.</p>
        <Button href="/my-coach">Open My coach</Button>
      {:else if stopped}
        <!-- A4 with "Stop taking requests". -->
        <p class="text-[14px]">{first} isn't taking new clients right now.{info.expectSpots ? ` ${first} expects spots in ${info.expectSpots}.` : ""}</p>
      {:else}
        <div class="flex flex-col gap-1">
          <h1 class="text-xl font-bold tracking-tight">{info.full ? `Join ${first}'s waiting list` : `Ask ${first} to coach you`}</h1>
          <p class="text-[13px] text-muted-foreground">
            {info.full ? `${first} is full right now${info.expectSpots ? ` and expects spots in ${info.expectSpots}` : ""}. ` : ""}{first} reads these before replying. Only {first} sees your answers.
          </p>
        </div>
        <AskForm coachName={name} questions={info.questions} packages={info.packages} bind:answers bind:interested
          {signedIn} waitingList={info.full} onsignedin={signedInNow} onsend={send} />
      {/if}
    </section>
    {#if sent}
      <GetTheApp title="Get LogIt on your phone">
        <span class="text-[13px] text-slate-400">{first}'s replies come as notifications, and coaching happens in the app.</span>
      </GetTheApp>
    {/if}
    {#if info.otherCoach && info.relationship !== "active"}
      <p class="text-center text-xs text-muted-foreground">You're coached by {info.otherCoach}</p>
    {/if}
  {/if}
</main>
