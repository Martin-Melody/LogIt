<!-- Coaching › Today and Your month (canvas T2, W1, W5): cards, arranged by you (W13). Needs you
     is always first on Today. Your month steps back through months. V4: in Practice view the
     income card is a marked Example; everything else is what the samples really did. -->
<script lang="ts">
  import { onSampleActivity } from "$lib/features/guide/sampleActivity";
  import { practice } from "$lib/features/guide/sandbox.svelte";
  import CoachStart from "$lib/features/onboarding/CoachStart.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { coachApi } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { needsCoach, type PaymentClient } from "@logit/core/domain/coachPayments";
  import { PAGE_CARDS, STANDARD_LAYOUT, pageCards, type PageCard, type PageId } from "@logit/core/domain/coachMonth";
  import { parseCardPackCardId } from "@logit/core/plugins/cardPack";
  import CardPackCard from "$lib/features/coaching/today/CardPackCard.svelte";
  import { cardPacks } from "$lib/features/coaching/today/cardPacks.svelte";
  import type { CardLayout } from "@logit/core/domain/coachCards";
  import { coachAway } from "$lib/features/coaching/away.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { loadCoachingOverview, type CoachingOverview } from "$lib/features/coaching/coachingData";
  import NeedsYouCard from "$lib/features/coaching/today/NeedsYouCard.svelte";
  import AheadCard from "$lib/features/coaching/today/AheadCard.svelte";
  import ThisWeekCard from "$lib/features/coaching/today/ThisWeekCard.svelte";
  import LastWeekCard from "$lib/features/coaching/today/LastWeekCard.svelte";
  import PaidCard from "$lib/features/coaching/today/PaidCard.svelte";
  import ClientsCard from "$lib/features/coaching/today/ClientsCard.svelte";
  import WinsCard from "$lib/features/coaching/today/WinsCard.svelte";
  import WorthCard from "$lib/features/coaching/today/WorthCard.svelte";
  import EditCardsBar from "$lib/features/coaching/today/EditCardsBar.svelte";
  import CardFrame from "$lib/features/coaching/today/CardFrame.svelte";
  import { monthData, monthKey, monthRange } from "$lib/features/coaching/today/monthData.svelte";

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);
  let layout = $state<CardLayout | null>(null);

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
  onMount(() => void coachApi.getCards().then((l) => (layout = l), () => (layout = {})));
  // Payments that need the coach (failed, overdue, paused) belong here too, not only on the
  // Payments page (bug hunt 6.2). No payments set up: nothing to add.
  let payments = $state<PaymentClient[]>([]);
  let allPayments = $state<PaymentClient[]>([]);
  // Canvas Z4: Stripe needs something (restricted, or details due), in Stripe's words.
  let stripeNeeds = $state<string | null | false>(false);
  onMount(async () => {
    try {
      const o = await coachPaymentsApi.overview();
      payments = needsCoach(o.clients);
      allPayments = o.clients;
      stripeNeeds = o.account.connected && (!o.account.ready || o.account.requirementsDue) && (o.account.requirementsDue || !!o.account.needs) ? (o.account.needs ?? null) : false;
    } catch { payments = []; }
  });
  // The server's month never counts samples, so it isn't reloaded when they act (every few seconds).
  onMount(() => onSampleActivity(() => void load()));

  const view = $derived<PageId>(page.url.searchParams.get("view") === "month" ? "month" : "today");
  const thisMonth = monthKey(new Date());
  const month = $derived(page.url.searchParams.get("m") ?? thisMonth);
  const range = $derived(monthRange(month));
  function go(params: Record<string, string | null>) {
    const u = new URL(page.url);
    for (const [k, v] of Object.entries(params)) { if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
    void goto(u, { noScroll: true, keepFocus: true });
  }
  function stepMonth(by: number) {
    const d = new Date(range.fromMs);
    d.setMonth(d.getMonth() + by);
    const k = monthKey(d);
    go({ m: k === thisMonth ? null : k });
  }

  // Canvas W13: the page's cards, or your edit of them.
  let editing = $state(false);
  let draft = $state<PageCard[]>([]);
  let saving = $state(false);
  let dragFrom = $state<number | null>(null);
  const cards = $derived(editing ? draft : pageCards(view === "today" ? layout?.today : layout?.month, view));
  $effect(() => { void view; editing = false; });
  function startEditing() { draft = [...cards]; editing = true; }
  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= draft.length || (view === "today" && (i === 0 || j === 0))) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j]!, next[i]!];
    draft = next;
  }
  async function done() {
    saving = true;
    try {
      layout = await coachApi.saveCards({ ...(layout ?? {}), [view]: draft });
      editing = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your cards");
    } finally {
      saving = false;
    }
  }
  const nameOf = (id: PageCard) => {
    const pack = parseCardPackCardId(id);
    return pack ? (cardPacks.nameOf(pack.pluginId, pack.cardId) ?? "A card pack's card") : PAGE_CARDS.find((c) => c.id === id)!.name;
  };
  $effect(() => { if (cards.some((c) => c.startsWith("plugin:"))) void cardPacks.load(); });
  const monday = new Date().getDay() === 1;
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <p class="mb-1 text-[13px] text-muted-foreground">{view === "today" ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "Your coaching, in numbers"}</p>
      <h1 class="text-[26px] font-bold tracking-tight">{view === "today" ? "Today" : "Your month"}</h1>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if view === "month"}
        <Button variant="ghost" size="icon" class="size-8" aria-label="Month before" onclick={() => stepMonth(-1)}><ChevronLeftIcon class="size-4" /></Button>
        <span class="min-w-24 text-center text-sm font-semibold">{range.label}</span>
        <Button variant="ghost" size="icon" class="size-8" aria-label="Month after" disabled={month === thisMonth} onclick={() => stepMonth(1)}><ChevronRightIcon class="size-4" /></Button>
      {/if}
      <Tabs.Root value={view} onValueChange={(v) => go({ view: v === "month" ? "month" : null, m: null })}>
        <Tabs.List aria-label="Page">
          <Tabs.Trigger value="today">Today</Tabs.Trigger>
          <Tabs.Trigger value="month">Your month</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      {#if !editing}<Button variant="outline" size="sm" disabled={!layout} onclick={startEditing}>Edit cards</Button>{/if}
    </div>
  </header>

  <!-- The Set up coaching card (CoachStart) replaces the Studio welcome card: it has Take the walkthrough (canvas T1). -->
  {#if overview && view === "today"}<CoachStart {overview} />{/if}

  {#if editing}
    <EditCardsBar page={view} bind:cards={draft} {saving} ondone={() => void done()} onstandard={() => (draft = [...STANDARD_LAYOUT[view]])} />
  {/if}

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview || !layout}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-72 flex-[2_1_520px]" /><Skeleton class="h-72 flex-[1_1_300px]" /></div>
  {:else if view === "today"}
    <!-- Needs you on the left, the rest beside it (canvas W1). -->
    <div class="flex flex-wrap items-start gap-4" role={editing ? "list" : undefined}>
      <div class="flex min-w-0 flex-[2_1_520px] flex-col gap-4">{@render frame(0)}</div>
      <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-4">{#each cards.slice(1) as id, i (id)}{@render frame(i + 1)}{/each}</div>
    </div>
  {:else}
    <div class="grid items-start gap-4 md:grid-cols-2" role={editing ? "list" : undefined}>
      {#each cards as id, i (id)}{@render frame(i)}{:else}<p class="text-[13px] text-muted-foreground">No cards. Edit cards to add some.</p>{/each}
    </div>
  {/if}
</div>

{#snippet frame(i: number)}
  {@const id = cards[i]}
  {#if id}
    <CardFrame {editing} name={nameOf(id)} fixed={id === "needs"} first={view === "today" ? i <= 1 : i === 0} last={i === cards.length - 1}
      onmove={(by) => move(i, by)} onremove={() => (draft = draft.filter((x) => x !== id))}
      ondragstart={() => (dragFrom = i)} ondragover={() => { if (dragFrom !== null && dragFrom !== i && !(view === "today" && (i === 0 || dragFrom === 0))) { const next = [...draft]; const [c] = next.splice(dragFrom, 1); next.splice(i, 0, c!); draft = next; dragFrom = i; } }}>
      {@render card(id)}
    </CardFrame>
  {/if}
{/snippet}

{#snippet card(id: PageCard)}
  {@const pack = parseCardPackCardId(id)}
  {#if overview}
    {#if pack}<CardPackCard pluginId={pack.pluginId} cardId={pack.cardId} page={view} {overview} />
    {:else if id === "needs"}<NeedsYouCard {overview} {payments} {stripeNeeds} />
    {:else if id === "ahead"}<AheadCard {overview} payments={allPayments} />
    {:else if id === "week"}{#if monday && !cards.includes("lastweek")}<LastWeekCard {overview} />{:else}<ThisWeekCard {overview} />{/if}
    {:else if id === "lastweek"}<LastWeekCard {overview} />
    {:else if id === "paid"}<PaidCard month={view === "month" ? month : thisMonth} practice={practice.on} />
    {:else if id === "clients"}<ClientsCard month={view === "month" ? month : thisMonth} practice={practice.on} samples={overview.clients.length} />
    {:else if id === "wins"}<WinsCard month={view === "month" ? month : thisMonth} {overview} />
    {:else if id === "worth"}<WorthCard {overview} />
    {/if}
  {/if}
{/snippet}
