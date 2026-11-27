<script lang="ts">
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { clientName } from "$lib/features/coaching/clientName";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { guideSignal } from "$lib/features/guide/signal";
  import { untrack } from "svelte";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import LockIcon from "@lucide/svelte/icons/lock";
  import { SHARE_AREAS } from "@logit/core/api/coachApi";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import CheckinAnswers from "$lib/features/coaching/CheckinAnswers.svelte";
  import ClientOverview from "$lib/features/coaching/client/ClientOverview.svelte";
  import ChangePackageDialog from "$lib/features/coaching/payments/ChangePackageDialog.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import type { CoachPackage, PaymentClient } from "@logit/core/domain/coachPayments";
  import { healthYeses } from "@logit/core/domain/coachCards";
  import ClientTraining from "$lib/features/coaching/client/ClientTraining.svelte";
  import ClientNutrition from "$lib/features/coaching/client/ClientNutrition.svelte";
  import ClientHabits from "$lib/features/coaching/client/ClientHabits.svelte";
  import ClientCheckins from "$lib/features/coaching/client/ClientCheckins.svelte";
  import ClientPrograms from "$lib/features/coaching/client/ClientPrograms.svelte";
  import ClientInsights from "$lib/features/coaching/client/ClientInsights.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi } from "@logit/core/api/coachApi";
  import EndCoachingDialog from "$lib/features/coaching/client/EndCoachingDialog.svelte";
  import AnswerAsDialog from "$lib/features/guide/AnswerAsDialog.svelte";
  import {
    loadCoachingOverview,
    parseSubmission,
    type ClientSummary,
    type CoachingOverview,
  } from "$lib/features/coaching/coachingData";
  import { sinceLabel, when } from "$lib/features/coaching/format";

  // Canvas K3: five tabs. Programs and Insights are parts of Training (old ?tab= links land
  // there, scrolled to them); the conversation lives in Messages.
  type Tab = "overview" | "training" | "nutrition" | "habits" | "checkins";
  const TABS: { id: Tab; label: string; area?: "nutrition" | "habits" | "checkins" }[] = [
    { id: "overview", label: "Overview" },
    { id: "training", label: "Training" },
    { id: "nutrition", label: "Nutrition", area: "nutrition" },
    { id: "habits", label: "Habits", area: "habits" },
    { id: "checkins", label: "Check-ins", area: "checkins" },
  ];

  const clientId = $derived(page.params.id!);
  const rawTab = $derived(page.url.searchParams.get("tab"));
  const tab = $derived<Tab>(rawTab === "programs" || rawTab === "insights" ? "training" : TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : "overview");
  // ?tab=programs / insights: Training, scrolled to that part. ?tab=messages: their conversation.
  $effect(() => {
    const part = rawTab;
    if (part === "messages" && c) void goto(`/messages?c=${c.relationshipId}`, { replaceState: true });
    if ((part === "programs" || part === "insights") && c) setTimeout(() => document.getElementById(`client-${part}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  });

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);
  let programsTab = $state<ClientPrograms | null>(null);
  // "Assign program" from another tab: the Programs tab opens its dialog when it mounts.
  let assignOnOpen = $state(false);
  // Canvas E1: "Pause or end coaching…" (?end=1 from the clients list or ⌘K opens it).
  let ending = $state(page.url.searchParams.get("end") === "1");
  // Canvas V2: "Answer as Niamh…" on a sample client (?answer=1 from the list's menu or ⌘K).
  let answering = $state(page.url.searchParams.get("answer") === "1");

  async function resume(relationshipId: string) {
    try {
      await coachApi.resumeCoaching(relationshipId);
      toast.success("Coaching carries on");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resume");
    }
  }



  async function load() {
    try {
      overview = await loadCoachingOverview();
      coachBadges.fromOverview(overview);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load this client";
    }
  }
  $effect(() => {
    void clientId;
    void load();
  });

  const c = $derived<ClientSummary | null>(overview?.clients.find((x) => x.id === clientId) ?? null);
  const latest = $derived(c ? (c.toReview[0] ?? overview?.inbox.find((i) => i.clientUserId === c.id) ?? null) : null);

  function setTab(t: Tab) {
    if (t !== "training") assignOnOpen = false;
    const u = new URL(page.url);
    u.searchParams.delete("q");
    if (t === "overview") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    void goto(u, { noScroll: true, keepFocus: true });
    if (t === "checkins") guideSignal("client.tab-checkins");
  }

  function assign() {
    if (tab === "training" && programsTab) {
      programsTab.openAssignDialog();
    } else {
      assignOnOpen = true;
      setTab("training");
    }
  }

  // ?assign=1 (from ⌘K or a row menu): open the Programs tab with its assign dialog.
  $effect(() => {
    if (!c || !page.url.searchParams.has("assign")) return;
    untrack(() => {
      assignOnOpen = true;
      programsTab?.openAssignDialog();
      const u = new URL(page.url);
      u.searchParams.delete("assign");
      u.searchParams.set("tab", "training");
      void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
    });
  });

  const firstOf = (n: string) => n.split(" ")[0] || n;
  let endStart = $state<"pause" | "end">("pause");
  let showAnswers = $state(false);

  // Canvas K3: a Yes to a health question on a form not yet reviewed.
  const healthFlag = $derived.by(() => {
    if (!c || !overview || !c.sharing.checkins) return null;
    for (const i of overview.inbox.filter((x) => x.clientUserId === c.id && x.reviewedAtMs == null)) {
      const submission = parseSubmission(i);
      if (!submission) continue;
      const schedule = overview.schedules.find((s) => s.schedule.id === i.scheduleId)?.schedule ?? null;
      const yes = healthYeses({ id: i.id, clientId: c.id, submission, schedule, reviewed: false });
      if (yes.length) return { id: i.id, yes, form: schedule?.name ?? "Check-in" };
    }
    return null;
  });
  async function markHealthRead() {
    if (!c || !healthFlag) return;
    try {
      await coachApi.setCheckinReviewed(c.id, healthFlag.id, true);
      toast.success("Marked read");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  // Change package… (canvas K3), the same dialog as Payments › Clients.
  let changeFor = $state<PaymentClient | null>(null);
  let packages = $state<CoachPackage[]>([]);
  async function openChangePackage() {
    if (!c) return;
    try {
      const o = await coachPaymentsApi.overview();
      const p = o.clients.find((x) => x.relationshipId === c.relationshipId) ?? null;
      if (!o.packages.some((k) => !k.hidden)) return void toast("Make a package in Payments first.", { action: { label: "Payments", onClick: () => void goto("/coaching/payments?tab=packages") } });
      if (!p) return void toast.error("Couldn't find their payments");
      packages = o.packages;
      changeFor = p;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load payments");
    }
  }

  function programLine(x: ClientSummary): string {
    const p = x.program;
    if (!p) return "trains on their own plan";
    if (p.state === "running") return `${p.program.name}, week ${p.week} of ${p.totalWeeks}`;
    if (p.state === "scheduled") return `${p.program.name} starts ${when(p.startsAtMs!)}`;
    return `${p.program.name}, not started yet`;
  }
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Clients", href: "/clients" }, { label: c?.name ?? clientName(clientId) }]} />

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview}
    <Skeleton class="h-14 w-80" /><Skeleton class="h-9" /><Skeleton class="h-64" />
  {:else if !c}
    <p class="text-[13px] text-muted-foreground">This person isn't one of your clients. <a href="/clients" class="text-primary hover:underline">Back to Clients</a></p>
  {:else}
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3.5">
        <Avatar name={c.name} url={c.avatarUrl} size={48} />
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{c.name}{#if c.isSample}<SampleBadge />{/if}</h1>
          <p class="mt-0.5 text-[13px] text-muted-foreground">{c.isSample ? "Sample client" : `@${c.username}`}{sinceLabel(c.since) ? ` · client since ${sinceLabel(c.since)}` : ""} · {programLine(c)}</p>
          {#if c.pausedUntil}
            <p class="mt-1 text-[13px] font-medium text-warning">Paused until {new Date(c.pausedUntil).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · payments and check-ins paused</p>
          {:else if c.endsAt}
            <p class="mt-1 text-[13px] font-medium text-warning">Coaching ends {new Date(c.endsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-2" data-guide="client-actions">
        <Button variant="outline" class="h-[34px]" href="/messages?c={c.relationshipId}">Message</Button>
        <button type="button" onclick={assign} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Assign program</button>
        {#if c.isSample}
          <Button variant="outline" size="sm" class="h-[34px]" onclick={() => (answering = true)}>Answer as {c.name.split(" ")[0]}</Button>
        {:else}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="More for {c.name}"><EllipsisIcon class="size-4" /></Button>{/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-60">
              <!-- Canvas K3. -->
              <DropdownMenu.Item onSelect={() => void goto(`/messages?c=${c.relationshipId}`)}>Message</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void openChangePackage()}>Change package…</DropdownMenu.Item>
              <DropdownMenu.Item disabled={!c.sharing.checkins} onSelect={() => void goto(`/clients/${c.id}?tab=checkins&send=1`)}>Send a form…</DropdownMenu.Item>
              <DropdownMenu.Item disabled={!c.answers.length} onSelect={() => (showAnswers = true)}>{c.answers.length ? `${firstOf(c.name)}'s answers when they asked` : "No answers from when they asked"}</DropdownMenu.Item>
              <DropdownMenu.Separator />
              {#if c.pausedUntil}<DropdownMenu.Item onSelect={() => void resume(c.relationshipId)}>Resume coaching now</DropdownMenu.Item>
              {:else}<DropdownMenu.Item onSelect={() => { endStart = "pause"; ending = true; }}>Pause coaching…</DropdownMenu.Item>{/if}
              <DropdownMenu.Item class="text-destructive" onSelect={() => { endStart = "end"; ending = true; }}>End coaching…</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    </header>

    {#if healthFlag}
      <!-- Canvas K3: a Yes to a health question, in amber until you mark the form read. -->
      <div role="alert" class="flex flex-wrap items-center gap-3 rounded-[10px] border border-warning/40 bg-warning/8 px-4 py-3 text-[13px]">
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="font-semibold">{firstOf(c.name)} answered Yes to {healthFlag.yes.length === 1 ? "a health question" : `${healthFlag.yes.length} health questions`}</span>
          <span class="text-muted-foreground">{healthFlag.yes.join(" · ")} ({healthFlag.form})</span>
        </span>
        <Button variant="outline" size="sm" href="/coaching/checkins?id={encodeURIComponent(healthFlag.id)}&client={c.id}">Open the form</Button>
        <Button size="sm" onclick={() => void markHealthRead()}>Mark read</Button>
      </div>
    {/if}

    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
    <Tabs.List variant="line" aria-label="Client" data-guide="client-tabs" class="flex-wrap gap-0.5">
      {#each TABS as t (t.id)}
        {@const locked = t.area && !c.sharing[t.area]}
        <Tabs.Trigger value={t.id} class="px-3.5 {locked ? 'opacity-70' : ''}">
          {#if locked}<LockIcon class="size-3" aria-label="not shared" />{/if}{t.label}
          {#if t.id === "checkins" && c.toReview.length}<span class="rounded-full bg-warning/12 px-1.5 text-[11px] font-semibold text-warning">{c.toReview.length}</span>{/if}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
    </Tabs.Root>

    {#key clientId}
      {#if tab === "overview"}
        <ClientOverview client={c} {overview} />
      {:else if tab === "training"}
        <div class="flex flex-col gap-8">
          <ClientTraining clientId={c.id} relationshipId={c.relationshipId} username={c.username} name={c.name} sharing={c.sharing} pluginConsent={c.pluginConsent} />
          <section id="client-programs" aria-label="Programs" class="flex scroll-mt-4 flex-col gap-3">
            <h2 class="text-base font-semibold">Programs</h2>
            <ClientPrograms bind:this={programsTab} openAssign={assignOnOpen} clientId={c.id} relationshipId={c.relationshipId} username={c.username} name={c.name} sharing={c.sharing} />
          </section>
          <section id="client-insights" aria-label="Insights" class="flex scroll-mt-4 flex-col gap-3">
            <h2 class="text-base font-semibold">Insights</h2>
            <ClientInsights clientId={c.id} name={c.name} sharing={c.sharing} />
          </section>
        </div>
      {:else if tab === "nutrition"}
        <ClientNutrition clientId={c.id} username={c.username} name={c.name} relationshipId={c.relationshipId} sharing={c.sharing} />
      {:else if tab === "habits"}
        <ClientHabits clientId={c.id} username={c.username} name={c.name} sharing={c.sharing} />
      {:else if tab === "checkins"}
        <ClientCheckins clientId={c.id} username={c.username} name={c.name} sharing={c.sharing} />
      {/if}
    {/key}
  {/if}
</div>

{#if c?.isSample}
  <AnswerAsDialog bind:open={answering} userId={c.id} relationshipId={c.relationshipId} name={c.name} />
{/if}
{#if c && !c.isSample}
  <EndCoachingDialog bind:open={ending} start={endStart} relationshipId={c.relationshipId} name={c.name} ondone={async () => {
    const rid = c?.relationshipId;
    await load();
    // Ended: they're no longer a client, so back to the list.
    if (!overview?.clients.some((x) => x.relationshipId === rid)) await goto("/clients");
  }} />
{/if}
{#if c}
  <ChangePackageDialog bind:open={() => !!changeFor, (v) => { if (!v) changeFor = null; }} client={changeFor} {packages} ondone={load} />
  <!-- Canvas K3: what they answered when they asked to be coached. -->
  <Dialog.Root bind:open={showAnswers}>
    <Dialog.Content class="max-h-[85svh] overflow-y-auto sm:max-w-lg">
      <Dialog.Header>
        <Dialog.Title>{firstOf(c.name)}'s answers when they asked</Dialog.Title>
        <Dialog.Description>From the questions on your profile when they asked you to coach them.</Dialog.Description>
      </Dialog.Header>
      <dl class="flex flex-col">
        {#each c.answers as a (a.questionId)}
          <dt class="border-t border-border pt-2.5 text-xs text-muted-foreground">{a.question}</dt>
          <dd class="pb-2.5 text-[13px] whitespace-pre-wrap">{a.value || "–"}</dd>
        {/each}
      </dl>
    </Dialog.Content>
  </Dialog.Root>
{/if}
