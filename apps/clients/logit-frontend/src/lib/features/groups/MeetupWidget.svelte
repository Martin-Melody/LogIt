<!-- Home's meetup card (design canvas row 6): your pinned event, or the next one you're going
     to, with a countdown and who's going. Shows nothing when there isn't one; gone once it starts. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Pin } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { eventsApi, goingLine, type GroupEvent } from "@logit/core/api/eventsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { countdown, eventShort } from "./eventTime";

  let ev = $state<GroupEvent | null>(null);
  let now = $state(Date.now());

  onMount(() => {
    if (authStore.isAuthenticated) void eventsApi.home().then((e) => (ev = e)).catch(() => {});
    const tick = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(tick);
  });

  const left = $derived(ev ? countdown(ev.startsAtMs, now) : null);
  const label = $derived(left ? (left.days > 0 ? `In ${left.days} days and ${left.hours} hours` : `In ${left.hours} hours and ${left.minutes} minutes`) : "");
</script>

{#if ev && left}
  <a href="/events/{ev.id}" class="block text-inherit no-underline">
    <Card.Root class="w-full transition-colors hover:bg-muted/30">
      <Card.Content class="flex flex-col gap-2.5 p-4">
        <div class="flex items-center justify-between gap-2">
          <h2 class="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">{#if ev.pinned}<Pin class="size-3.5" />Pinned meetup{:else}Next meetup{/if}</h2>
          {#if ev.answer === true}<span class="flex items-center gap-1 text-[12px] text-success"><Check class="size-3.5" />Going</span>{/if}
        </div>
        <div class="flex items-end justify-between gap-3">
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="truncate text-[17px] font-semibold">{ev.title}</span>
            <span class="truncate text-[13px] text-muted-foreground">{ev.groupName} · {eventShort(ev.startsAtMs, now)}</span>
          </span>
          <span aria-label={label} class="flex shrink-0 items-baseline gap-1 whitespace-nowrap tabular-nums">
            {#if left.days > 0}
              <span class="text-[28px] font-bold tracking-tight">{left.days}</span><span class="text-[13px] text-muted-foreground">{left.days === 1 ? "day" : "days"}</span>
              <span class="ml-1 text-[28px] font-bold tracking-tight">{left.hours}</span><span class="text-[13px] text-muted-foreground">h</span>
            {:else}
              <span class="text-[28px] font-bold tracking-tight">{left.hours}</span><span class="text-[13px] text-muted-foreground">h</span>
              <span class="ml-1 text-[28px] font-bold tracking-tight">{left.minutes}</span><span class="text-[13px] text-muted-foreground">min</span>
            {/if}
          </span>
        </div>
        <span class="text-[13px] text-muted-foreground">{goingLine(ev, authStore.user?.username ?? "")}</span>
      </Card.Content>
    </Card.Root>
  </a>
{/if}
