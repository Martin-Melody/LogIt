<!-- Canvas W5: clients whose last two weeks look different from before. Only you see this. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { worthALook } from "@logit/core/domain/coachMonth";
  import { coachProblemText } from "@logit/core/domain/coachPayments";
  import { daysBetween } from "../format";
  import Avatar from "../Avatar.svelte";
  import { monthData } from "./monthData.svelte";
  import type { CoachingOverview } from "../coachingData";

  let { overview }: { overview: CoachingOverview } = $props();
  let ready = $state(false);
  $effect(() => {
    ready = false;
    void Promise.all([monthData.clientSessions(overview.clients), monthData.loadPayments().catch(() => {})]).then(() => (ready = true));
  });
  const list = $derived(ready ? worthALook(overview.clients.map((c) => {
    const p = monthData.payments?.find((x) => x.relationshipId === c.relationshipId);
    return {
      id: c.id, relationshipId: c.relationshipId, name: c.name,
      sessions: c.sharing.workouts ? (monthData.sessions[c.id] ?? []) : null,
      lateDays: c.missed ? daysBetween(c.missed.dueMs, Date.now()) : null,
      paymentProblem: p?.state === "failed" ? (p.unpaidSince ? `card failed ${new Date(p.unpaidSince).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : coachProblemText(p)) : null,
    };
  })) : null);
  const avatar = (id: string) => overview.clients.find((c) => c.id === id)?.avatarUrl ?? null;
</script>

<section aria-label="Worth a look" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4 text-[13px]">
  <h2 class="text-sm font-semibold">Worth a look</h2>
  <p class="pb-1 text-xs text-muted-foreground">Clients whose last 2 weeks look different from before. Only you see this.</p>
  {#if !list}
    <Skeleton class="h-20" />
  {:else}
    {#each list as w (w.id)}
      <div class="flex items-center gap-3 border-t border-border py-2.5">
        <Avatar name={w.name} url={avatar(w.id)} />
        <span class="flex min-w-0 flex-1 flex-col"><a href="/clients/{w.id}" class="font-medium hover:underline">{w.name}</a><span class="text-xs text-muted-foreground">{w.reasons.join(" · ")}</span></span>
        <Button variant="outline" size="sm" href="/messages?c={w.relationshipId}">Message</Button>
      </div>
    {:else}
      <p class="border-t border-border py-3 text-muted-foreground">Nobody: everyone's carrying on as before.</p>
    {/each}
  {/if}
</section>
