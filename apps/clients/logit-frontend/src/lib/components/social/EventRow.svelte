<!-- One event in a list (design canvas G1, E2): the date block, name, when and who's going, and
     Going / Go (a tap answers Going) or Cancelled. -->
<script lang="ts">
  import { Check } from "lucide-svelte";
  import type { GroupEvent } from "@logit/core/api/eventsApi";
  import { dayBadge, eventShort } from "$lib/features/groups/eventTime";

  const { event, past = false, ongo }: { event: GroupEvent; past?: boolean; ongo?: (e: GroupEvent) => void } = $props();
  const badge = $derived(dayBadge(event.startsAtMs));
  const sub = $derived(
    [eventShort(event.startsAtMs), event.kind === "Session" ? null : event.kind, event.place, event.cancelled ? "cancelled" : `${event.going} ${past ? "went" : "going"}`]
      .filter(Boolean).join(" · "),
  );
</script>

<div class="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0 {event.cancelled || past ? 'opacity-60' : ''}">
  <a href="/events/{event.id}" class="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline">
    <span class="flex w-11 shrink-0 flex-col items-center tabular-nums"><span class="text-xl font-bold leading-tight">{badge.day}</span><span class="text-[12px] text-muted-foreground">{badge.month}</span></span>
    <span class="flex min-w-0 flex-col gap-0.5"><span class="truncate text-[15px] font-semibold">{event.title}</span><span class="truncate text-[13px] text-muted-foreground">{sub}</span></span>
  </a>
  {#if event.cancelled}
    <span class="shrink-0 text-[12px] text-destructive">Cancelled</span>
  {:else if !past && event.answer === true}
    <span class="flex h-8 shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 text-[12px] font-semibold text-success"><Check class="size-3.5" />Going</span>
  {:else if !past && ongo}
    <button type="button" class="h-8 shrink-0 rounded-full border border-border px-3 text-[12px] font-semibold" onclick={() => ongo(event)}>Go</button>
  {/if}
</div>
