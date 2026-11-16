<script lang="ts">
  import { canCoach } from "$lib/workspace";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onSampleActivity } from "$lib/features/guide/sandbox.svelte";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import SandboxCard from "$lib/features/guide/SandboxCard.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import {
    loadCoachingOverview,
    needsYou,
    type ClientSummary,
    type CoachingOverview,
  } from "$lib/features/coaching/coachingData";
  import { ago, daysBetween, when } from "$lib/features/coaching/format";

  // Your clients in one table (this replaced the old Roster page). Invites you sent wait at
  // the bottom; people asking through a link wait on Today and Invite links.

  let overview = $state<CoachingOverview | null>(null);
  let error = $state<string | null>(null);
  let inviteName = $state("");
  let inviteError = $state<string | null>(null);
  let inviting = $state(false);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      overview = await loadCoachingOverview();
      coachBadges.fromOverview(overview);
      viewingClient.setClients(await coachApi.listClients());
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your clients";
    }
  }

  onMount(() => {
    // Without Studio there's no coaching workspace; your own coach lives in My coach.
    if (!canCoach()) void goto("/my-coach", { replaceState: true });
    else void load();
  });
  onMount(() => onSampleActivity(() => void load()));

  let show = $state<"all" | "real" | "sample">("all");
  const shownClients = $derived(
    (overview?.clients ?? []).filter((c) => show === "all" || (show === "sample") === c.isSample),
  );
  const sampleCount = $derived((overview?.clients ?? []).filter((c) => c.isSample).length);

  async function invite(e: Event) {
    e.preventDefault();
    const username = inviteName.trim().replace(/^@/, "");
    if (!username) return;
    inviting = true;
    inviteError = null;
    try {
      await coachApi.inviteClient(username);
      inviteName = "";
      toast.success(`Invite sent to @${username}`);
      await load();
    } catch (err) {
      inviteError = err instanceof ApiError
        ? err.status === 404 ? `No one is called @${username}.` : err.message
        : "Couldn't send the invite.";
    } finally {
      inviting = false;
    }
  }

  async function cancelInvite(relationshipId: string) {
    busy = relationshipId;
    try {
      await coachApi.revokeRelationship(relationshipId);
      await load();
    } finally {
      busy = null;
    }
  }

  const waiting = $derived(overview ? needsYou(overview).filter((i) => i.kind === "checkin" || i.kind === "message").slice(0, 4) : []);

  function checkinCell(c: ClientSummary): { text: string; tone: "warn" | "bad" | "" } {
    if (!c.sharing.checkins) return { text: "Not shared", tone: "" };
    if (c.toReview.length) return { text: c.toReview.length === 1 ? "New" : `${c.toReview.length} new`, tone: "warn" };
    if (c.missed) {
      const late = daysBetween(c.missed.dueMs, Date.now());
      return { text: late > 0 ? `Late ${late} day${late === 1 ? "" : "s"}` : "Due today", tone: "bad" };
    }
    if (c.lastCheckinAtMs) return { text: `Sent ${when(c.lastCheckinAtMs)}`, tone: "" };
    return { text: c.scheduleCount ? "None yet" : "No form", tone: "" };
  }

  function programCell(c: ClientSummary): string {
    const p = c.program;
    if (!p) return "Own plan";
    if (p.state === "running") return `${p.program.name} · week ${p.week} of ${p.totalWeeks}`;
    if (p.state === "scheduled") return `${p.program.name} · starts ${when(p.startsAtMs!)}`;
    return `${p.program.name} · not started`;
  }

  const tone = { warn: "bg-warning/12 text-warning", bad: "bg-destructive/12 text-destructive", "": "" } as const;
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Clients</h1>
      {#if overview}
        <p class="mt-1 text-[13px] text-muted-foreground">
          {overview.clients.length} active{#if overview.sent.length}{` · ${overview.sent.length} invite${overview.sent.length === 1 ? "" : "s"} waiting`}{/if}{#if waiting.length}{` · ${waiting.length} need${waiting.length === 1 ? "s" : ""} you`}{/if}
        </p>
      {/if}
    </div>
    <form class="flex flex-col gap-1" onsubmit={invite}>
      <div class="flex gap-2">
        <label for="invite-username" class="sr-only">Client's username</label>
        <input id="invite-username" bind:value={inviteName} placeholder="Client's username" autocomplete="off"
          class="h-9 w-[220px] rounded-[10px] border border-input bg-card px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
        <button type="submit" disabled={inviting || !inviteName.trim()}
          class="h-9 rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Invite</button>
      </div>
      {#if inviteError}<span class="text-xs text-destructive">{inviteError}</span>{/if}
    </form>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !overview}
    <Skeleton class="h-24" />
    <Skeleton class="h-72" />
  {:else}
    {#if waiting.length}
      <section class="flex flex-col gap-2.5 rounded-[10px] border border-warning/30 bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">Needs you</h2>
        <div class="flex flex-wrap gap-2.5">
          {#each waiting as i, n (n)}
            {#if i.kind === "checkin"}
              <a href="/coaching/checkins?id={encodeURIComponent(i.item.id)}&client={i.client.id}" class="flex flex-[1_1_280px] items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 hover:bg-muted/70">
                <Avatar name={i.client.name} url={i.client.avatarUrl} size={30} />
                <span class="flex flex-col gap-0.5"><span class="text-[13px] font-medium">{i.client.name} sent a check-in</span><span class="text-xs text-muted-foreground">{ago(i.item.submittedAtMs)}</span></span>
              </a>
            {:else if i.kind === "message"}
              <a href="/messages?c={i.client.relationshipId}" class="flex flex-[1_1_280px] items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 hover:bg-muted/70">
                <Avatar name={i.client.name} url={i.client.avatarUrl} size={30} />
                <span class="flex flex-col gap-0.5"><span class="text-[13px] font-medium">{i.client.name} messaged you</span><span class="text-xs text-muted-foreground">{i.client.unread} unread</span></span>
              </a>
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    <div id="sandbox" class="scroll-mt-16"><SandboxCard /></div>

    {#if sampleCount > 0}
      <div role="group" aria-label="Show" class="flex w-fit gap-[3px] rounded-[9px] bg-muted p-[3px]">
        {#each [["all", `All ${overview.clients.length}`], ["real", `Real ${overview.clients.length - sampleCount}`], ["sample", `Sample ${sampleCount}`]] as [k, label] (k)}
          <button type="button" aria-pressed={show === k} onclick={() => (show = k as typeof show)}
            class="h-7 rounded-[7px] px-3 text-xs {show === k ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}">{label}</button>
        {/each}
      </div>
    {/if}

    <section data-guide="clients-list" class="rounded-[10px] border border-border bg-card px-1.5 py-2">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr class="text-left text-xs text-muted-foreground">
              <th class="px-3 py-2 font-medium">Client</th>
              <th class="px-3 py-2 font-medium">Last 7 days</th>
              <th class="px-3 py-2 font-medium">Last workout</th>
              <th class="px-3 py-2 font-medium">Check-in</th>
              <th class="px-3 py-2 font-medium">Program</th>
              <th class="px-3 py-2 font-medium">Messages</th>
            </tr>
          </thead>
          <tbody>
            {#each shownClients as c (c.relationshipId)}
              {@const ck = checkinCell(c)}
              <tr class="border-t border-border align-middle">
                <td class="px-3 py-3">
                  <a href="/clients/{c.id}" class="flex items-center gap-2.5" onclick={() => guideSignal("client.opened")}>
                    <Avatar name={c.name} url={c.avatarUrl} size={30} />
                    <span><span class="block font-medium">{c.name}{#if c.isSample}<SampleBadge />{/if}</span><span class="text-xs text-muted-foreground">{c.isSample ? "Sample client" : `@${c.username}`}</span></span>
                  </a>
                </td>
                {#if c.sharing.workouts}
                  <td class="px-3 py-3">{c.sessions7d}{c.program?.state === "running" ? ` of ${c.program.daysPerWeek}` : ""}</td>
                  <td class="px-3 py-3">{c.lastSessionAtMs ? when(c.lastSessionAtMs) : "None yet"}</td>
                {:else}
                  <td class="px-3 py-3 text-muted-foreground" colspan="2">Workouts not shared</td>
                {/if}
                <td class="px-3 py-3">
                  {#if ck.tone}<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {tone[ck.tone]}">{ck.text}</span>{:else}<span class="text-muted-foreground">{ck.text}</span>{/if}
                </td>
                <td class="px-3 py-3">{programCell(c)}</td>
                <td class="px-3 py-3">
                  {#if c.unread}<a href="/messages?c={c.relationshipId}" class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{c.unread} new</a>{:else}<a href="/messages?c={c.relationshipId}" class="text-muted-foreground hover:text-foreground">Open</a>{/if}
                </td>
              </tr>
            {/each}
            {#each overview.sent as s (s.relationshipId)}
              <tr class="border-t border-border align-middle">
                <td class="px-3 py-3">
                  <span class="flex items-center gap-2.5">
                    <Avatar name={s.client.displayName || s.client.username} url={s.client.avatarUrl} size={30} dim />
                    <span><span class="block font-medium">@{s.client.username}</span><span class="text-xs text-muted-foreground">Invite sent {ago(Date.parse(s.createdAt))}</span></span>
                  </span>
                </td>
                <td class="px-3 py-3 text-muted-foreground" colspan="4">Nothing is shared until they accept.</td>
                <td class="px-3 py-3">
                  <button type="button" disabled={busy === s.relationshipId} onclick={() => cancelInvite(s.relationshipId)}
                    class="h-[30px] rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">Cancel invite</button>
                </td>
              </tr>
            {/each}
            {#if overview.clients.length === 0 && overview.sent.length === 0}
              <tr><td colspan="6" class="px-3 py-6 text-center text-muted-foreground">No clients yet. Invite someone by username, or <a href="/coaching/links" class="text-primary hover:underline">share an invite link</a>.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
