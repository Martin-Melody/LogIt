<!-- Asking a coach (canvas P2, K7, A4, R1): who they are, the state you're in with them, and
     the form. Used by /ask/{username} (its own page, for people coming from getlogit.app/@name,
     signed in or not) and by AskDialog (a coach's profile inside the app, already signed in). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { ApiError, apiClient } from "@logit/core/api/client";
  import { coachApi, SHARE_ALL, type AskInfo } from "@logit/core/api/coachApi";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import AskForm from "$lib/features/coaching/ask/AskForm.svelte";
  import AskSent from "$lib/features/coaching/ask/AskSent.svelte";
  import { shortDate } from "$lib/features/coaching/format";
  import { awayLine } from "@logit/core/domain/coachProfile";

  let { username, link = null, sent = $bindable(null), plain = false }: {
    username: string;
    /** Opened from one of the coach's links (?l=CODE). */
    link?: string | null;
    sent?: { relationshipId: string; waiting: boolean } | null;
    /** In a dialog: no card around it. */
    plain?: boolean;
  } = $props();
  let info = $state<AskInfo | null>(null);
  let error = $state<string | null>(null);
  let signedIn = $state(apiClient.isAuthenticated());
  let answers = $state<Record<string, string>>({});
  let interested = $state<string | null>(null);

  // Canvas L1: opened from one of the coach's links (?l=CODE). Asking goes through it, so the
  // coach sees where they came from, with the link's package picked.
  let linkCode = $state<string | null>(null);

  async function load() {
    try {
      info = await coachApi.askInfo(username);
      const l = link;
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
  export function title() { return info ? (info.full ? `Join ${first}'s waiting list` : `Ask ${first} to coach you`) : "Ask to be coached"; }

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

{#if error}
  <section class="rounded-[12px] border border-border bg-card p-5">
    <h1 class="text-lg font-bold">Ask to be coached</h1>
    <p class="mt-1 text-[13px] text-muted-foreground">{error}</p>
  </section>
{:else if !info}
  <Skeleton class="h-96" />
{:else}
  <section class="flex flex-col gap-5 {plain ? '' : 'rounded-[12px] border border-border bg-card p-5'}">
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
        {@const away = awayLine(info.awayUntil, first)}
        {#if away}<p class="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px]">{away}</p>{/if}
        <AskForm coachName={name} questions={info.questions} packages={info.packages} bind:answers bind:interested
          {signedIn} waitingList={info.full} onsignedin={signedInNow} onsend={send} />
      {/if}
    </section>
  {#if info.otherCoach && info.relationship !== "active"}
    <p class="text-center text-xs text-muted-foreground">You're coached by {info.otherCoach}</p>
  {/if}
{/if}
