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
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
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

  type Tab = "overview" | "training" | "insights" | "nutrition" | "habits" | "checkins" | "programs" | "messages";
  const TABS: { id: Tab; label: string; area?: "workouts" | "nutrition" | "habits" | "checkins" }[] = [
    { id: "overview", label: "Overview" },
    { id: "training", label: "Training", area: "workouts" },
    { id: "insights", label: "Insights" },
    { id: "nutrition", label: "Nutrition", area: "nutrition" },
    { id: "habits", label: "Habits", area: "habits" },
    { id: "checkins", label: "Check-ins", area: "checkins" },
    { id: "programs", label: "Programs" },
    { id: "messages", label: "Messages" },
  ];

  const clientId = $derived(page.params.id!);
  const tab = $derived((page.url.searchParams.get("tab") as Tab | null) ?? "overview");

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
    if (t !== "programs") assignOnOpen = false;
    const u = new URL(page.url);
    u.searchParams.delete("q");
    if (t === "overview") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    void goto(u, { noScroll: true, keepFocus: true });
    if (t === "checkins") guideSignal("client.tab-checkins");
  }

  function assign() {
    if (tab === "programs") {
      programsTab?.openAssignDialog();
    } else {
      assignOnOpen = true;
      setTab("programs");
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
      u.searchParams.set("tab", "programs");
      void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
    });
  });

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
        <button type="button" onclick={() => setTab("messages")} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted">Message</button>
        <button type="button" onclick={assign} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Assign program</button>
        {#if c.isSample}
          <Button variant="outline" size="sm" class="h-[34px]" onclick={() => (answering = true)}>Answer as {c.name.split(" ")[0]}</Button>
        {:else}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="More for {c.name}"><EllipsisIcon class="size-4" /></Button>{/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-56">
              {#if c.pausedUntil}<DropdownMenu.Item onSelect={() => void resume(c.relationshipId)}>Resume coaching now</DropdownMenu.Item>{/if}
              <DropdownMenu.Item class="text-destructive" onSelect={() => (ending = true)}>Pause or end coaching…</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    </header>

    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
    <Tabs.List variant="line" aria-label="Client" data-guide="client-tabs" class="flex-wrap gap-0.5">
      {#each TABS as t (t.id)}
        {@const locked = t.area && !c.sharing[t.area]}
        <Tabs.Trigger value={t.id} class="px-3.5 {locked ? 'opacity-70' : ''}">
          {#if locked}<LockIcon class="size-3" aria-label="not shared" />{/if}{t.label}
          {#if t.id === "checkins" && c.toReview.length}<span class="rounded-full bg-warning/12 px-1.5 text-[11px] font-semibold text-warning">{c.toReview.length}</span>{/if}
          {#if t.id === "messages" && c.unread}<span class="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{c.unread}</span>{/if}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
    </Tabs.Root>

    {#key clientId}
      {#if tab === "overview"}
        <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="text-xs text-muted-foreground">Sessions, last 7 days</div>
            <div class="mt-1 text-[22px] font-bold">{c.sharing.workouts ? c.sessions7d : "–"}{#if c.sharing.workouts && c.program?.state === "running"}<span class="text-[13px] font-normal text-muted-foreground">{` of ${c.program.daysPerWeek}`}</span>{/if}</div>
          </div>
          <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="text-xs text-muted-foreground">Last workout</div>
            <div class="mt-1 text-[22px] font-bold">{!c.sharing.workouts ? "Not shared" : c.lastSessionAtMs ? when(c.lastSessionAtMs) : "None yet"}</div>
          </div>
          <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="text-xs text-muted-foreground">Last check-in</div>
            <div class="mt-1 text-[22px] font-bold">{!c.sharing.checkins ? "Not shared" : c.lastCheckinAtMs ? when(c.lastCheckinAtMs) : c.missed ? "Missed" : "None yet"}</div>
          </div>
          <div class="rounded-[10px] border border-border bg-card px-[18px] py-4">
            <div class="text-xs text-muted-foreground">Program</div>
            <div class="mt-1 truncate text-[22px] font-bold">{c.program?.state === "running" ? `Week ${c.program.week} of ${c.program.totalWeeks}` : c.program ? "Not started" : "Own plan"}</div>
          </div>
        </div>

        <div class="flex flex-wrap items-start gap-4">
          <section class="flex min-w-0 flex-[2_1_480px] flex-col gap-1 rounded-[10px] border bg-card px-[18px] py-4 {latest && latest.reviewedAtMs == null ? 'border-warning/30' : 'border-border'}">
            {#if !c.sharing.checkins}
              <h2 class="text-sm font-semibold">Check-ins</h2>
              <p class="text-[13px] text-muted-foreground">{c.name} doesn't share check-ins with you.</p>
            {:else if latest}
              {@const sub = parseSubmission(latest)}
              {@const form = overview.schedules.find((s) => s.schedule.id === latest.scheduleId)?.schedule ?? null}
              <div class="flex items-baseline justify-between gap-2">
                <h2 class="text-sm font-semibold">{form?.name ?? "Check-in"} · {when(latest.submittedAtMs)}</h2>
                {#if latest.reviewedAtMs == null}
                  <a href="/coaching/checkins?id={encodeURIComponent(latest.id)}&client={c.id}" class="h-[30px] rounded-lg bg-primary px-2.5 text-xs font-semibold leading-[30px] text-primary-foreground">Review and reply</a>
                {:else}
                  <span class="text-xs text-muted-foreground">Reviewed {when(latest.reviewedAtMs)}</span>
                {/if}
              </div>
              {#if sub}<CheckinAnswers schedule={form} submission={sub} />{/if}
            {:else}
              <h2 class="text-sm font-semibold">Check-ins</h2>
              <p class="text-[13px] text-muted-foreground">{c.scheduleCount ? "Nothing sent yet." : "No check-in form yet."} <button type="button" class="text-primary hover:underline" onclick={() => setTab("checkins")}>{c.scheduleCount ? "See forms" : "Add one"}</button></p>
            {/if}
          </section>

          <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
              <div class="flex items-baseline justify-between pb-1.5"><h2 class="text-sm font-semibold">Messages</h2><button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => setTab("messages")}>All ›</button></div>
              <MessageThread relationshipId={c.relationshipId} otherName={c.name} compact onRead={() => (c.unread = 0)} />
            </section>
            <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
              <div class="flex items-baseline justify-between"><h2 class="text-sm font-semibold">What {c.name} shares with you</h2></div>
              <p class="text-[13px] leading-relaxed text-muted-foreground">
                {#if SHARE_AREAS.every((a) => c.sharing[a.key])}
                  Everything: workouts, nutrition diary, body weight, habits and check-ins.
                {:else}
                  Shares {SHARE_AREAS.filter((a) => c.sharing[a.key]).map((a) => a.label.toLowerCase()).join(", ") || "nothing yet"}.
                  Not {SHARE_AREAS.filter((a) => !c.sharing[a.key]).map((a) => a.label.toLowerCase()).join(", ")}.
                {/if}
                Never their social posts or other messages. They can change this any time.
              </p>
            </section>
          </div>
        </div>
      {:else if tab === "training"}
        <ClientTraining clientId={c.id} username={c.username} name={c.name} sharing={c.sharing} />
      {:else if tab === "insights"}
        <ClientInsights clientId={c.id} name={c.name} sharing={c.sharing} />
      {:else if tab === "nutrition"}
        <ClientNutrition clientId={c.id} username={c.username} name={c.name} relationshipId={c.relationshipId} sharing={c.sharing} />
      {:else if tab === "habits"}
        <ClientHabits clientId={c.id} username={c.username} name={c.name} sharing={c.sharing} />
      {:else if tab === "checkins"}
        <ClientCheckins clientId={c.id} username={c.username} name={c.name} sharing={c.sharing} />
      {:else if tab === "programs"}
        <ClientPrograms bind:this={programsTab} openAssign={assignOnOpen} clientId={c.id} relationshipId={c.relationshipId} username={c.username} name={c.name} sharing={c.sharing} />
      {:else if tab === "messages"}
        <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] pb-4 pt-2">
          <MessageThread relationshipId={c.relationshipId} otherName={c.name} onRead={() => (c.unread = 0)} />
        </section>
      {/if}
    {/key}
  {/if}
</div>

{#if c?.isSample}
  <AnswerAsDialog bind:open={answering} userId={c.id} relationshipId={c.relationshipId} name={c.name} />
{/if}
{#if c && !c.isSample}
  <EndCoachingDialog bind:open={ending} relationshipId={c.relationshipId} name={c.name} ondone={async () => {
    const rid = c?.relationshipId;
    await load();
    // Ended: they're no longer a client, so back to the list.
    if (!overview?.clients.some((x) => x.relationshipId === rid)) await goto("/clients");
  }} />
{/if}
