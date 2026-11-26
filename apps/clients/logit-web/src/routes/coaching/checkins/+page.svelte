<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sandbox.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type CheckinInboxItem } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import CheckinAnswers from "$lib/features/coaching/CheckinAnswers.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import {
    loadCoachingOverview,
    parseSubmission,
    type ClientSummary,
    type CoachingOverview,
  } from "$lib/features/coaching/coachingData";
  import { daysBetween, shortDate, weekdayDate, when } from "$lib/features/coaching/format";

  type Filter = "review" | "missed" | "reviewed" | "forms";

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);
  let reply = $state("");
  let busy = $state(false);

  const filter = $derived((page.url.searchParams.get("f") as Filter | null) ?? "review");
  const selectedId = $derived(page.url.searchParams.get("id"));
  const selectedClient = $derived(page.url.searchParams.get("client"));

  async function load() {
    try {
      overview = await loadCoachingOverview();
      coachBadges.fromOverview(overview);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load check-ins";
    }
  }
  onMount(load);
  onMount(() => onSampleActivity(() => void load()));

  const clientOf = (id: string): ClientSummary | undefined => overview?.clients.find((c) => c.id === id);
  const toReview = $derived(overview?.inbox.filter((i) => i.reviewedAtMs == null) ?? []);
  const reviewed = $derived(overview?.inbox.filter((i) => i.reviewedAtMs != null) ?? []);
  const missed = $derived(overview?.clients.filter((c) => c.missed) ?? []);
  const list = $derived(filter === "reviewed" ? reviewed : toReview);

  const selected = $derived.by((): CheckinInboxItem | null => {
    if (!overview || filter === "missed" || filter === "forms") return null;
    const hit = selectedId ? overview.inbox.find((i) => i.id === selectedId && (!selectedClient || i.clientUserId === selectedClient)) : null;
    return hit ?? list[0] ?? null;
  });
  const selClient = $derived(selected ? clientOf(selected.clientUserId) : undefined);
  const selSubmission = $derived(selected ? parseSubmission(selected) : null);
  const selSchedule = $derived(selected ? overview?.schedules.find((s) => s.schedule.id === selected.scheduleId)?.schedule ?? null : null);
  const previous = $derived.by(() => {
    if (!selected || !overview) return null;
    const earlier = overview.inbox
      .filter((i) => i.clientUserId === selected.clientUserId && i.scheduleId === selected.scheduleId && i.submittedAtMs < selected.submittedAtMs)
      .sort((a, b) => b.submittedAtMs - a.submittedAtMs)[0];
    return earlier ? parseSubmission(earlier) : null;
  });

  // A new selection starts with an empty reply.
  let lastSel = "";
  $effect(() => {
    const key = selected ? `${selected.clientUserId}/${selected.id}` : "";
    if (key !== lastSel) {
      lastSel = key;
      reply = "";
    }
  });

  function setFilter(f: Filter) {
    const u = new URL(page.url);
    u.searchParams.set("f", f);
    u.searchParams.delete("id");
    u.searchParams.delete("client");
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
  }

  function select(i: CheckinInboxItem) {
    const u = new URL(page.url);
    u.searchParams.set("id", i.id);
    u.searchParams.set("client", i.clientUserId);
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
  }

  async function markReviewed(sendReply: boolean, reviewedNow = true) {
    if (!selected || !overview || busy) return;
    busy = true;
    try {
      const text = sendReply ? reply.trim() : "";
      if (text) {
        await messagesApi.send({ relationshipId: selected.relationshipId, messageId: createId("msg"), body: text, createdAtMs: Date.now() });
      }
      // The reply is kept with the review too, so the client sees it with this check-in.
      const at = await coachApi.setCheckinReviewed(selected.clientUserId, selected.id, reviewedNow, text || undefined);
      const done = selected;
      overview = {
        ...overview,
        inbox: overview.inbox.map((i) => (i.id === done.id && i.clientUserId === done.clientUserId ? { ...i, reviewedAtMs: at } : i)),
      };
      for (const c of overview.clients) c.toReview = overview.inbox.filter((i) => i.clientUserId === c.id && i.reviewedAtMs == null);
      coachBadges.fromOverview(overview);
      reply = "";
      if (reviewedNow) guideSignal("checkin.reviewed");
      toast.success(reviewedNow ? (sendReply ? "Reply sent, marked as reviewed" : "Marked as reviewed") : "Moved back to review");
      // Go on to the next one waiting.
      const u = new URL(page.url);
      u.searchParams.delete("id");
      u.searchParams.delete("client");
      void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = false;
    }
  }

  const NUDGE = "Hi! Just a reminder your check-in is waiting. Fill it in when you get a minute.";
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Check-ins</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">Your clients' answers in one place. Reviewed ones move out of the way on every device.</p>
    </div>
    <Tabs.Root value={filter} onValueChange={(v) => setFilter(v as Filter)}>
      <Tabs.List aria-label="Show" data-guide="checkins-tabs" class="h-auto w-auto flex-wrap gap-1 rounded-[10px] border border-border bg-card">
        {#each [["review", `To review · ${toReview.length}`], ["missed", `Missed · ${missed.length}`], ["reviewed", "Reviewed"], ["forms", "Forms"]] as [f, label] (f)}
          <Tabs.Trigger value={f} class="h-8 flex-none rounded-lg data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:shadow-none">{label}</Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-64 flex-[1_1_280px]" /><Skeleton class="h-96 flex-[999_1_560px]" /></div>
  {:else if filter === "missed"}
    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-2">
      {#each missed as c (c.id)}
        {@const late = daysBetween(c.missed!.dueMs, Date.now())}
        <div class="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
          <Avatar name={c.name} url={c.avatarUrl} />
          <span class="flex min-w-0 flex-[1_1_240px] flex-col">
            <a href="/clients/{c.id}?tab=checkins" class="text-[13px] font-semibold hover:underline">{c.name}</a>
            <span class="text-xs text-muted-foreground">{c.missed!.schedule.name} · was due {weekdayDate(c.missed!.dueMs)}{late > 0 ? ` · ${late} day${late === 1 ? "" : "s"} late` : ""}</span>
          </span>
          <a href="/messages?c={c.relationshipId}&draft={encodeURIComponent(NUDGE)}" class="h-[30px] rounded-lg border border-border px-2.5 text-xs leading-[30px] hover:bg-muted">Nudge</a>
        </div>
      {:else}
        <p class="py-4 text-[13px] text-muted-foreground">No one has missed a check-in.</p>
      {/each}
    </section>
  {:else if filter === "forms"}
    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-2">
      <p class="py-2 text-xs text-muted-foreground">Each client has their own forms. Add one from their Check-ins tab.</p>
      {#each overview.clients as c (c.id)}
        {@const forms = overview.schedules.filter((s) => s.recipientUserId === c.id)}
        <div class="flex flex-col gap-1 border-t border-border py-3">
          <a href="/clients/{c.id}?tab=checkins" class="text-[13px] font-semibold hover:underline">{c.name}</a>
          {#each forms as f (f.schedule.id)}
            <a href="/clients/{c.id}/checkins/{f.schedule.id}?u={c.username}" class="flex justify-between gap-3 text-[13px] text-muted-foreground hover:text-foreground">
              <span>{f.schedule.name}{f.schedule.archived ? " (archived)" : ""}</span>
              <span class="capitalize">{f.schedule.cadence} · {f.schedule.questions.length} question{f.schedule.questions.length === 1 ? "" : "s"}</span>
            </a>
          {:else}
            <span class="text-xs text-muted-foreground">No forms yet.</span>
          {/each}
        </div>
      {/each}
    </section>
  {:else}
    <div class="flex flex-wrap items-start gap-4">
      <section aria-label="Check-ins" class="flex flex-[1_1_280px] flex-col gap-0.5 rounded-[10px] border border-border bg-card p-1.5">
        {#each list as i (i.clientUserId + i.id)}
          {@const c = clientOf(i.clientUserId)}
          {@const s = overview.schedules.find((x) => x.schedule.id === i.scheduleId)?.schedule}
          <button type="button" onclick={() => select(i)} aria-current={selected === i ? "true" : undefined}
            class="flex items-center gap-2.5 rounded-lg p-3 text-left {selected === i ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <Avatar name={c?.name ?? "?"} url={c?.avatarUrl ?? null} size={30} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-[13px] font-semibold">{c?.name ?? "Client"}</span>
              <span class="truncate text-xs text-muted-foreground">{s?.name ?? "Check-in"} · {when(i.submittedAtMs, Date.now(), true)}</span>
            </span>
            {#if i.reviewedAtMs == null}<span class="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">New</span>{/if}
          </button>
        {:else}
          <p class="p-3 text-[13px] text-muted-foreground">{filter === "reviewed" ? "Nothing reviewed in the last 4 months." : "All caught up."}</p>
        {/each}
      </section>

      {#if selected && selSubmission}
        <section data-guide="checkin-review" class="flex min-w-0 flex-[999_1_560px] flex-col gap-1 rounded-[10px] border border-border bg-card px-[22px] py-5">
          <div class="flex flex-wrap justify-between gap-2.5 pb-2">
            <div class="flex items-center gap-3">
              <Avatar name={selClient?.name ?? "?"} url={selClient?.avatarUrl ?? null} size={40} />
              <div>
                <h2 class="text-lg font-bold">{selClient?.name ?? "Client"} · {selSchedule?.name ?? "Check-in"}</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Week of {shortDate(selSubmission.periodStartMs)} · sent {when(selected.submittedAtMs, Date.now(), true)} ·
                  <a href="/clients/{selected.clientUserId}" class="underline hover:text-foreground">open client</a>
                </p>
              </div>
            </div>
            {#if selected.reviewedAtMs == null}
              <span class="h-fit rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">To review</span>
            {:else}
              <span class="h-fit text-xs text-muted-foreground">Reviewed {when(selected.reviewedAtMs)}</span>
            {/if}
          </div>

          {#if selClient}
            <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 pb-2">
              <div class="rounded-lg bg-muted px-3 py-2.5">
                <div class="text-xs text-muted-foreground">Sessions, last 7 days</div>
                <div class="text-[15px] font-semibold">{selClient.sharing.workouts ? `${selClient.sessions7d}${selClient.program?.state === "running" ? ` of ${selClient.program.daysPerWeek}` : ""}` : "Not shared"}</div>
              </div>
              <div class="rounded-lg bg-muted px-3 py-2.5">
                <div class="text-xs text-muted-foreground">Program</div>
                <div class="truncate text-[15px] font-semibold">{selClient.program?.state === "running" ? `Week ${selClient.program.week} of ${selClient.program.totalWeeks}` : selClient.program ? "Not started" : "Own plan"}</div>
              </div>
              <div class="rounded-lg bg-muted px-3 py-2.5">
                <div class="text-xs text-muted-foreground">Previous check-in</div>
                <div class="text-[15px] font-semibold">{previous?.submittedAtMs ? shortDate(previous.submittedAtMs) : "First one"}</div>
              </div>
            </div>
          {/if}

          <CheckinAnswers schedule={selSchedule} submission={selSubmission} {previous} />

          <div class="flex flex-col gap-2 border-t border-border pt-3">
            <label for="reply" class="text-xs font-medium text-muted-foreground">Reply to {selClient?.name ?? "them"}</label>
            <textarea id="reply" rows="3" bind:value={reply} placeholder="Goes to your messages with them."
              class="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
            <div class="flex flex-wrap gap-2">
              {#if selected.reviewedAtMs == null}
                <button type="button" disabled={busy || !reply.trim()} onclick={() => markReviewed(true)}
                  class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send and mark reviewed</button>
                <button type="button" disabled={busy} onclick={() => markReviewed(false)}
                  class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50">Mark reviewed</button>
              {:else}
                <button type="button" disabled={busy || !reply.trim()} onclick={() => markReviewed(true)}
                  class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send reply</button>
                <button type="button" disabled={busy} onclick={() => markReviewed(false, false)}
                  class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50">Move back to review</button>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
