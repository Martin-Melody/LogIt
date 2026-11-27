<!-- Today's Needs you (canvas T2, W1): what needs you, grouped by what you'll do. Always first
     on Today. -->
<script lang="ts">
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import { needsActions } from "$lib/features/commands/commands.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { Button } from "$lib/components/ui/button";
  import { coachAway } from "../away.svelte";
  import Avatar from "../Avatar.svelte";
  import { coachProblemText, type PaymentClient } from "@logit/core/domain/coachPayments";
  import { needsYou, type CoachingOverview, type NeedsYou } from "../coachingData";
  import { ago, daysBetween, weekdayDate, when } from "../format";

  let { overview, payments, stripeNeeds }: { overview: CoachingOverview; payments: PaymentClient[]; stripeNeeds: string | null | false } = $props();

  const items = $derived(needsYou(overview));
  // Canvas W1: grouped by the kind of work, so a batch of check-ins is one button.
  const review = $derived(items.filter((i) => i.kind === "checkin").sort((a, b) => a.at - b.at));
  const reply = $derived(items.filter((i) => i.kind === "message" || i.kind === "waiting" || i.kind === "missed"));
  const decide = $derived(items.filter((i) => i.kind === "request" || i.kind === "ending" || i.kind === "lasting-swap"));

  /** Where a Needs you item's main button goes (its menu's Open). */
  function openHrefOf(i: NeedsYou): string {
    switch (i.kind) {
      case "checkin": return `/coaching/checkins?id=${encodeURIComponent(i.item.id)}&client=${i.client.id}`;
      case "lasting-swap": return `/clients/${i.client.id}?tab=training`;
      case "message": case "waiting": return `/messages?c=${i.client.relationshipId}`;
      case "missed": return `/messages?c=${i.client.relationshipId}&draft=${encodeURIComponent(NUDGE)}`;
      case "ending": return `/clients/${i.client.id}/next-block`;
      case "request": return `/clients?tab=requests&r=${i.request.relationshipId}`;
    }
  }

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

<section data-guide="today-needs-you" class="flex min-w-0 flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
  <div class="flex items-baseline justify-between pb-1">
    <h2 class="text-sm font-semibold">Needs you</h2>
    <span class="text-xs text-muted-foreground">{items.length + payments.length ? `${items.length + payments.length} · grouped by what you'll do` : ""}</span>
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
  {#if review.length > 1}
    {@const first = review[0]!}
    <h3 class="pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Review · {review.length} check-ins</h3>
    <div class="flex items-center gap-3 py-3">
      <span class="flex -space-x-2">{#each review.slice(0, 3) as i, n (n)}{#if i.kind === "checkin"}<Avatar name={i.client.name} url={i.client.avatarUrl} />{/if}{/each}</span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[13px] font-medium">{[...new Set(review.map((i) => (i.kind === "checkin" ? i.client.name.split(" ")[0] : "")))].join(", ")}</span>
        <span class="text-xs text-muted-foreground">Oldest first, one after another</span>
      </span>
      {#if first.kind === "checkin"}<a href="/coaching/checkins?id={encodeURIComponent(first.item.id)}&client={first.client.id}" class="h-8 shrink-0 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Start reviewing</a>{/if}
    </div>
  {:else if review.length}
    <h3 class="pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Review</h3>
    {#each review as i, n (n)}{@render row(i)}{/each}
  {/if}
  {#if reply.length}
    <h3 class="pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Reply · {reply.length}</h3>
    {#each reply as i, n (n)}{@render row(i)}{/each}
  {/if}
  {#if decide.length || payments.length}
    <h3 class="pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Decide · {decide.length + payments.length}</h3>
    {#each decide as i, n (n)}{@render row(i)}{/each}
    {#each payments as c (c.relationshipId)}
      {@const who = c.client.displayName || c.client.username}
      <div class="flex items-center gap-3 border-t border-border py-3 first-of-type:border-t-0">
        <Avatar name={who} url={c.client.avatarUrl} />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-[13px] font-medium">{coachProblemText(c)}</span>
          <span class="text-xs text-muted-foreground">Payments</span>
        </span>
        <a href="/coaching/payments" class="h-8 shrink-0 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Open payments</a>
      </div>
    {/each}
  {/if}
</section>

{#snippet row(i: NeedsYou)}
  {@const who = i.kind === "request" ? (i.request.client.displayName || i.request.client.username) : i.client.name}
  <ActionMenu actions={needsActions({ name: who, clientId: i.kind === "request" ? undefined : i.client.id, relationshipId: i.kind === "request" ? undefined : i.client.relationshipId, openHref: openHrefOf(i) })} label="More for {who}">
  {#snippet children({ props, more })}
  <div {...props} class="group flex items-center gap-3 border-t border-border py-3">
    <Avatar name={who} url={i.kind === "request" ? i.request.client.avatarUrl : i.client.avatarUrl} />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="text-[13px] font-medium">{title(i)}</span>
      <span class="truncate text-xs text-muted-foreground">{detail(i)}</span>
    </span>
    {#if i.kind === "checkin"}
      <a href="/coaching/checkins?id={encodeURIComponent(i.item.id)}&client={i.client.id}" class="h-8 shrink-0 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Review</a>
    {:else if i.kind === "lasting-swap"}
      <a href="/clients/{i.client.id}?tab=training" class="h-8 shrink-0 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">Look</a>
    {:else if i.kind === "message" || i.kind === "waiting"}
      <a href="/messages?c={i.client.relationshipId}" class="h-8 shrink-0 rounded-[9px] {i.kind === 'waiting' ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border font-medium hover:bg-muted'} px-3 text-xs leading-8">Reply</a>
    {:else if i.kind === "missed"}
      <a href="/messages?c={i.client.relationshipId}&draft={encodeURIComponent(NUDGE)}" class="h-8 shrink-0 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Nudge</a>
    {:else if i.kind === "ending"}
      <a href="/clients/{i.client.id}/next-block" class="h-8 shrink-0 rounded-[9px] border border-border px-3 text-xs font-medium leading-8 hover:bg-muted">Plan next block</a>
    {:else}
      <a href="/clients?tab=requests&r={i.request.relationshipId}" class="h-8 shrink-0 rounded-[9px] bg-primary px-3 text-xs font-semibold leading-8 text-primary-foreground">{i.request.stage === "offered" ? "Offer again" : "Answer"}</a>
    {/if}
    {@render more("opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100")}
  </div>
  {/snippet}
  </ActionMenu>
{/snippet}
