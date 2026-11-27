<!-- A client's Overview (canvas K3, W4): their cards for This week, This month (‹ › back through
     months) or This block, drawn with the same widget renderer as the phone's cards. + Card picks
     the cards for them, their package or everyone (W11). -->
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { coachApi, SHARE_AREAS } from "@logit/core/api/coachApi";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import { cardPeriod, cardsFor, coachCard, COACH_CARDS, type CardLayout, type CoachCardId } from "@logit/core/domain/coachCards";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import type { DiaryDay } from "@logit/core/domain/nutrition";
  import type { WidgetAction } from "@logit/core/plugins/widgetView";
  import { getWebNutritionDeps } from "$lib/deps";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import WidgetViewRenderer from "$lib/features/plugins/render/WidgetViewRenderer.svelte";
  import { provideWidgetActions } from "$lib/features/plugins/render/widgetAction";
  import { loadClientCardData, type ClientCardData } from "./clientCards";
  import ClientPluginCard from "./ClientPluginCard.svelte";
  import CardPickerDialog from "./CardPickerDialog.svelte";
  import type { ClientSummary, CoachingOverview } from "../coachingData";

  let { client, overview }: { client: ClientSummary; overview: CoachingOverview } = $props();
  const first = $derived(client.name.split(" ")[0] || client.name);

  // Taps on a card: coaching pages and this page's tabs open; the rest happens in their app.
  provideWidgetActions((a: WidgetAction) => {
    if ("navigate" in a) {
      if (a.navigate.startsWith("?")) {
        const u = new URL(page.url);
        for (const [k, v] of new URLSearchParams(a.navigate.slice(1))) u.searchParams.set(k, v);
        return void goto(u, { noScroll: true });
      }
      if (/^\/(coaching|clients|messages)(\/|\?|$)/.test(a.navigate)) return void goto(a.navigate);
    }
    toast(`That happens in ${first}'s app.`);
  });

  let data = $state<ClientCardData | null>(null);
  let layout = $state<CardLayout | null>(null);
  let pkg = $state<{ id: string | null; name: string | null }>({ id: null, name: null });
  let picking = $state(false);
  let kind = $state<"week" | "month" | "block">("week");
  let monthsBack = $state(0);
  let days = $state<DiaryDay[]>([]);

  $effect(() => {
    const c = client;
    data = null;
    void loadClientCardData(c, overview).then((d) => { if (client.id === c.id) data = d; });
  });
  $effect(() => {
    void coachApi.getCards().then((l) => (layout = l)).catch(() => (layout = {}));
    void coachPaymentsApi.overview().then((o) => {
      const p = o.clients.find((x) => x.client.id === client.id);
      pkg = { id: p?.packageId ?? null, name: p?.packageName ?? null };
    }).catch(() => {});
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
  });

  // A running program's start: its end less its weeks (programStatus only sets startsAtMs while scheduled).
  const block = $derived(client.program?.state === "running" && client.program.endsAtMs
    ? { startMs: client.program.endsAtMs - client.program.totalWeeks * 7 * 86_400_000, endMs: client.program.endsAtMs, label: `${client.program.program.name}, week ${client.program.week} of ${client.program.totalWeeks}` }
    : null);
  const period = $derived(cardPeriod(kind === "block" && !block ? "week" : kind, Date.now(), { monthsBack, block }));
  $effect(() => {
    const p = period, c = client;
    if (!c.sharing.nutrition) return void (days = []);
    void getWebNutritionDeps(c.id).nutritionRepo.listDaysInRange(localDateIso(new Date(p.fromMs)), localDateIso(new Date(p.toMs - 1))).then((d) => (days = d)).catch(() => (days = []));
  });

  const chosen = $derived(cardsFor(layout, client.id, pkg.id));
  const isCoachCard = (id: string): id is CoachCardId => COACH_CARDS.some((c) => c.id === id);
  const shares = $derived(SHARE_AREAS.filter((a) => client.sharing[a.key]).map((a) => a.label.toLowerCase()));
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <Tabs.Root value={kind} onValueChange={(v) => { kind = v as typeof kind; monthsBack = 0; }}>
        <Tabs.List aria-label="Period">
          <Tabs.Trigger value="week">This week</Tabs.Trigger>
          <Tabs.Trigger value="month">{kind === "month" ? period.label : "This month"}</Tabs.Trigger>
          <Tabs.Trigger value="block" disabled={!block}>This block</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      {#if kind === "month"}
        <Button variant="ghost" size="icon" class="size-8" aria-label="Month before" onclick={() => (monthsBack += 1)}><ChevronLeftIcon class="size-4" /></Button>
        <Button variant="ghost" size="icon" class="size-8" aria-label="Month after" disabled={monthsBack === 0} onclick={() => (monthsBack -= 1)}><ChevronRightIcon class="size-4" /></Button>
      {:else if kind === "block" && block}
        <span class="text-xs text-muted-foreground">{block.label}</span>
      {/if}
    </div>
    <Button variant="outline" size="sm" onclick={() => (picking = true)} disabled={!layout}><PlusIcon class="size-3.5" /> Card</Button>
  </div>

  {#if !data || !layout}
    <div class="grid gap-4 md:grid-cols-2">{#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-36 rounded-[10px]" />{/each}</div>
  {:else}
    <div class="grid items-start gap-4 md:grid-cols-2" data-guide="client-cards">
      {#each chosen.cards as id (id)}
        {#if isCoachCard(id)}
          <WidgetViewRenderer view={coachCard(id, { ...data, now: Date.now(), period, diaryDays: days })} />
        {:else if id.startsWith("plugin:")}
          {@const p = plugins.get(id.slice(7))}
          {#if p?.enabled}<ClientPluginCard plugin={p} {client} untilMs={period.toMs} />{/if}
        {/if}
      {/each}
      <section class="flex flex-col gap-1 rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px]">
        <h2 class="text-sm font-semibold">{first} shares</h2>
        <p class="leading-relaxed text-muted-foreground">
          {shares.length === SHARE_AREAS.length ? "Everything: workouts, food diary, weight and photos, habits and check-ins." : shares.length ? `${shares.join(", ")}. Not ${SHARE_AREAS.filter((a) => !client.sharing[a.key]).map((a) => a.label.toLowerCase()).join(", ")}.` : "Nothing yet."}
          Never their social posts or other messages; they can change this any time.
        </p>
      </section>
    </div>
  {/if}
</div>

{#if layout}
  <CardPickerDialog bind:open={picking} {client} packageId={pkg.id} packageName={pkg.name} {layout} onsaved={(l) => (layout = l)} />
{/if}
