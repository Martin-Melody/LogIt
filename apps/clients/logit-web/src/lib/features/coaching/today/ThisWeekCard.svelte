<!-- Canvas T2: each client's sessions this week. -->
<script lang="ts">
  import ClientHoverCard from "../ClientHoverCard.svelte";
  import Avatar from "../Avatar.svelte";
  import { when } from "../format";
  import type { CoachingOverview } from "../coachingData";

  let { overview }: { overview: CoachingOverview } = $props();
</script>

<section data-guide="today-week" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
  <div class="flex items-baseline justify-between pb-1">
    <h2 class="text-sm font-semibold">This week</h2>
    <span class="text-xs text-muted-foreground">Sessions, last 7 days</span>
  </div>
  {#each overview.clients as c (c.relationshipId)}
    <a href="/clients/{c.id}?tab=training" class="flex items-center gap-3 border-t border-border py-3 hover:opacity-90">
      <Avatar name={c.name} url={c.avatarUrl} />
      <span class="flex min-w-0 flex-1 flex-col">
        <ClientHoverCard clientId={c.id} span class="w-fit text-[13px] font-medium">{c.name}</ClientHoverCard>
        {#if !c.sharing.workouts}
          <span class="text-xs text-muted-foreground">Doesn't share workouts</span>
        {:else if c.lastSessionAtMs && when(c.lastSessionAtMs) === "today"}
          <span class="text-xs text-success">Trained today</span>
        {:else}
          <span class="text-xs text-muted-foreground">{c.lastSessionAtMs ? `Last trained ${when(c.lastSessionAtMs)}` : "No workouts yet"}</span>
        {/if}
      </span>
      {#if c.sharing.workouts}
        <span class="text-[13px] tabular-nums text-muted-foreground">{c.sessions7d}{c.program?.state === "running" ? ` / ${c.program.daysPerWeek}` : ""}</span>
      {/if}
    </a>
  {:else}
    <p class="border-t border-border py-4 text-[13px] text-muted-foreground">Your clients show up here.</p>
  {/each}
</section>
