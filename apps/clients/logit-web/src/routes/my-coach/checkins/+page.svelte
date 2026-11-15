<script lang="ts">
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { checkinPeriodLabel, type CheckinRow } from "@logit/core/domain/Checkin";
  import { loadMyCheckins, type MyCheckins } from "$lib/features/coaching/myCheckins";
  import { shortDate, weekdayDate } from "$lib/features/coaching/format";

  // My coach › Check-ins: this period's, then every earlier one with whether it was sent
  // and reviewed. Sent ones open read-only with the coach's reply.

  let data = $state<MyCheckins | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      data = await loadMyCheckins();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your check-ins";
    }
  });

  function line(r: CheckinRow): string {
    switch (r.state) {
      case "due": return r.dueMs ? `Due ${weekdayDate(r.dueMs)} · ${r.schedule.questions.length} questions` : `${r.schedule.questions.length} questions`;
      case "draft": return r.dueMs ? `Draft · due ${weekdayDate(r.dueMs)}` : "Draft";
      case "late": return `Late, was due ${weekdayDate(r.dueMs)}${r.submission ? " · draft" : ""}`;
      case "not-sent": return "Not sent";
      default: {
        const sent = r.submission?.submittedAtMs ?? 0;
        const late = r.dueMs && sent > r.dueMs ? ` · ${Math.ceil((sent - r.dueMs) / 86_400_000)} day${Math.ceil((sent - r.dueMs) / 86_400_000) === 1 ? "" : "s"} late` : "";
        return `Sent ${weekdayDate(sent)}${late}`;
      }
    }
  }

  const BADGE: Record<CheckinRow["state"], { label: string; cls: string } | null> = {
    due: { label: "Due", cls: "bg-warning/15 text-warning" },
    draft: { label: "Draft", cls: "bg-warning/15 text-warning" },
    late: { label: "Late", cls: "bg-destructive/15 text-destructive" },
    sent: { label: "Sent", cls: "bg-muted text-muted-foreground" },
    reviewed: { label: "Reviewed", cls: "bg-success/15 text-success" },
    "not-sent": null,
  };

  const href = (r: CheckinRow) =>
    r.state === "sent" || r.state === "reviewed" ? `/my-coach/checkins/${r.submission!.id}`
    : r.state === "not-sent" ? null
    : `/my-coach/checkin/${r.schedule.id}?period=${r.periodIndex}`;
</script>

{#snippet row(r: CheckinRow)}
  {@const link = href(r)}
  {@const badge = BADGE[r.state]}
  {@const title = r.state === "due" || r.state === "draft" || r.state === "late" ? r.schedule.name : checkinPeriodLabel(r, shortDate)}
  {#if link}
    <a href={link} class="flex items-center gap-3 border-t border-border px-1 py-3 hover:opacity-90">
      <span class="min-w-0 flex-1"><span class="block text-[14px] {r.state === 'due' || r.state === 'late' || r.state === 'draft' ? 'font-semibold' : ''}">{title}</span><span class="text-xs text-muted-foreground">{line(r)}</span></span>
      {#if badge}<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {badge.cls}">{badge.label}</span>{/if}
      <span class="text-muted-foreground" aria-hidden="true">›</span>
    </a>
  {:else}
    <div class="flex items-center gap-3 border-t border-border px-1 py-3 text-muted-foreground">
      <span class="min-w-0 flex-1"><span class="block text-[14px]">{title}</span><span class="text-xs">{line(r)}</span></span>
    </div>
  {/if}
{/snippet}

<div class="mx-auto flex w-full max-w-[720px] flex-col gap-4">
  <a href="/my-coach" class="w-fit text-[13px] text-muted-foreground hover:text-foreground">‹ My coach</a>
  <h1 class="text-[26px] font-bold tracking-tight">Check-ins</h1>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-48" />
  {:else if !data.current.length && !data.earlier.length}
    <p class="text-[13px] text-muted-foreground">No check-ins from your coach yet.</p>
  {:else}
    {#if data.current.length}
      <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] pb-1 pt-3">
        <h2 class="pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This week</h2>
        {#each data.current as r (r.schedule.id + r.periodIndex)}{@render row(r)}{/each}
      </section>
    {/if}
    {#if data.earlier.length}
      <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] pb-1 pt-3">
        <h2 class="pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Earlier</h2>
        {#each data.earlier as r (r.schedule.id + r.periodIndex)}{@render row(r)}{/each}
      </section>
    {/if}
  {/if}
</div>
