<!-- Canvas W5: your clients' wins this month, from what they share: records, sessions against
     their programs, check-ins answered, and a line or two worth being proud of. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { dueIn, monthWins } from "@logit/core/domain/coachMonth";
  import { monthData, monthRange } from "./monthData.svelte";
  import { programEndMs, type CoachingOverview } from "../coachingData";

  let { month, overview }: { month: string; overview: CoachingOverview } = $props();
  let ready = $state(false);
  $effect(() => { ready = false; void monthData.clientSessions(overview.clients).then(() => (ready = true)); });

  const wins = $derived.by(() => {
    if (!ready) return null;
    const { fromMs, toMs } = monthRange(month);
    const inMonth = (ms: number) => ms >= fromMs && ms < toMs;
    return monthWins(overview.clients.map((c) => {
      const sent = overview.inbox.filter((i) => i.clientUserId === c.id && inMonth(i.submittedAtMs));
      return {
        id: c.id,
        name: c.name,
        sessions: c.sharing.workouts ? (monthData.sessions[c.id] ?? []) : null,
        daysPerWeek: c.program?.state === "running" ? c.program.daysPerWeek : null,
        checkinsSent: c.sharing.checkins ? sent.length : 0,
        checkinsReviewed: c.sharing.checkins ? sent.filter((i) => i.reviewedAtMs != null).length : 0,
        checkinsDue: c.sharing.checkins ? overview.schedules.filter((s) => s.recipientUserId === c.id).reduce((n, s) => n + dueIn(s.schedule, fromMs, Math.min(toMs, Date.now())), 0) : 0,
        finishedBlock: overview.programs.some((p) => p.recipientUserId === c.id && !p.program.archived && inMonth(programEndMs(p.program) ?? -1) && (programEndMs(p.program) ?? Infinity) <= Date.now()),
      };
    }), fromMs, toMs);
  });
</script>

<section aria-label="Your clients' wins" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px]">
  <h2 class="pb-1 text-sm font-semibold">Your clients' wins</h2>
  {#if !wins}
    <Skeleton class="h-28" />
  {:else}
    <dl class="grid grid-cols-[1fr_auto] gap-x-3">
      <dt class="border-t border-border py-2 text-muted-foreground">Personal records</dt><dd class="border-t border-border py-2 text-right font-semibold tabular-nums {wins.records ? 'text-warning' : ''}">{wins.records}</dd>
      {#if wins.sessions}<dt class="border-t border-border py-2 text-muted-foreground">Sessions done</dt><dd class="border-t border-border py-2 text-right tabular-nums">{wins.sessions.done}{wins.sessions.planned ? ` of ${wins.sessions.planned} planned` : ""}</dd>{/if}
      {#if wins.checkins}<dt class="border-t border-border py-2 text-muted-foreground">Check-ins answered</dt><dd class="border-t border-border py-2 text-right tabular-nums">{wins.checkins.sent} of {wins.checkins.due}{wins.checkins.reviewedAll ? " · you replied to all" : ""}</dd>{/if}
    </dl>
    {#if wins.highlights.length}<p class="border-t border-border pt-2.5 text-muted-foreground">{wins.highlights.join(" ")}</p>{/if}
  {/if}
</section>
