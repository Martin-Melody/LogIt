<!-- Hover (or focus) a client's name on a coaching page: the numbers a coach checks first, with
     Message and Open (canvas board 4). `span` puts the trigger inside a row that's already a link. -->
<script lang="ts" module>
  import { loadCoachingOverview, type CoachingOverview } from "./coachingData";
  // One overview for every card on the page, kept for a minute.
  let cached: { at: number; load: Promise<CoachingOverview | null> } | null = null;
  function overview(): Promise<CoachingOverview | null> {
    if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), load: loadCoachingOverview().catch(() => null) };
    return cached.load;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Spinner } from "$lib/components/ui/spinner";
  import Avatar from "./Avatar.svelte";
  import SampleBadge from "$lib/features/guide/SampleBadge.svelte";
  import { daysBetween, when } from "./format";
  import type { ClientSummary } from "./coachingData";

  let { clientId, span = false, href, class: className = "", children }: { clientId: string; span?: boolean; href?: string; class?: string; children: Snippet } = $props();

  let open = $state(false);
  let c = $state<ClientSummary | null | undefined>(undefined);
  $effect(() => {
    if (open && c === undefined) void overview().then((o) => (c = o?.clients.find((x) => x.id === clientId) ?? null));
  });

  function program(x: ClientSummary): string {
    const p = x.program;
    if (!p) return "Own plan";
    if (p.state === "running") return `${p.program.name}, week ${p.week} of ${p.totalWeeks}`;
    if (p.state === "scheduled") return `${p.program.name}, starts ${when(p.startsAtMs!)}`;
    return `${p.program.name}, not started`;
  }
  function checkin(x: ClientSummary): string {
    if (!x.sharing.checkins) return "Not shared";
    if (x.toReview.length) return `${x.toReview.length} to review`;
    if (x.missed) {
      const late = daysBetween(x.missed.dueMs, Date.now());
      return late > 0 ? `${late} day${late === 1 ? "" : "s"} late` : "Due today";
    }
    if (x.lastCheckinAtMs) return `Sent ${when(x.lastCheckinAtMs)}`;
    return x.scheduleCount ? "None yet" : "No form";
  }
</script>

<HoverCard.Root bind:open openDelay={400} closeDelay={100}>
  {#if span}
    <HoverCard.Trigger>{#snippet child({ props })}<span {...props} tabindex="-1" class={className}>{@render children()}</span>{/snippet}</HoverCard.Trigger>
  {:else}
    <HoverCard.Trigger href={href ?? `/clients/${clientId}`} class={className}>{@render children()}</HoverCard.Trigger>
  {/if}<!--
  --><HoverCard.Content class="w-80 p-4" align="start">
    {#if c === undefined}
      <div class="grid h-24 place-items-center"><Spinner class="size-5 text-muted-foreground" /></div>
    {:else if c === null}
      <p class="text-[13px] text-muted-foreground">Not one of your clients any more.</p>
    {:else}
      {@const x = c}
      <div class="flex flex-col gap-3 text-[13px]">
        <div class="flex items-center gap-3">
          <Avatar name={x.name} url={x.avatarUrl} size={40} />
          <div class="min-w-0">
            <div class="flex items-center text-[15px] font-semibold"><span class="truncate">{x.name}</span>{#if x.isSample}<SampleBadge />{/if}</div>
            <div class="truncate text-xs text-muted-foreground">{x.isSample ? "Sample client" : `@${x.username}`}</div>
          </div>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5">
          <dt class="text-muted-foreground">Last 7 days</dt><dd>{x.sharing.workouts ? `${x.sessions7d} workout${x.sessions7d === 1 ? "" : "s"}` : "Workouts not shared"}</dd>
          {#if x.sharing.workouts}<dt class="text-muted-foreground">Last workout</dt><dd>{x.lastSessionAtMs ? when(x.lastSessionAtMs) : "None yet"}</dd>{/if}
          <dt class="text-muted-foreground">Program</dt><dd>{program(x)}</dd>
          <dt class="text-muted-foreground">Check-in</dt><dd class={x.toReview.length || x.missed ? "" : "text-muted-foreground"}>{checkin(x)}</dd>
        </dl>
        <div class="flex gap-2">
          <a href="/messages?c={x.relationshipId}" class="inline-flex h-[34px] flex-1 items-center justify-center rounded-[9px] border border-border text-[13px] font-medium hover:bg-muted">Message</a>
          <a href="/clients/{x.id}" class="inline-flex h-[34px] flex-1 items-center justify-center rounded-[9px] bg-primary text-[13px] font-semibold text-primary-foreground">Open {x.name}</a>
        </div>
      </div>
    {/if}
  </HoverCard.Content>
</HoverCard.Root>
