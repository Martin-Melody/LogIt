<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ClipboardCheck } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { checkinPeriodLabel, checkinRows, type CheckinRow } from "@logit/core/domain/Checkin";
  import { getCheckinRepo } from "$lib/data/repoProvider";
  import { cachedReviews, refreshCoaches } from "$lib/features/coaching/coachCache";

  // This week's check-ins (and a missed one), then every earlier one: sent, reviewed by the
  // coach, or not sent. Sent ones open read-only with the coach's reply.

  const ui = $state({ loading: true, error: null as string | null });
  let rows = $state<{ current: CheckinRow[]; earlier: CheckinRow[] }>({ current: [], earlier: [] });

  async function load() {
    ui.error = null;
    try {
      const repo = getCheckinRepo();
      const [schedules, submissions] = await Promise.all([repo.listAssignedSchedules(), repo.listSubmissions()]);
      rows = checkinRows(schedules, submissions, cachedReviews());
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load check-ins";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => {
    void load();
    // Newer reviews, when online; the list shows what's cached meanwhile.
    void refreshCoaches().then((ok) => { if (ok) void load(); });
  });

  const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  function line(r: CheckinRow): string {
    const n = r.schedule.questions.length;
    const qs = `${n} question${n === 1 ? "" : "s"}`;
    switch (r.state) {
      case "due": return r.dueMs ? `Due ${weekday(r.dueMs)} · ${qs}` : qs;
      case "draft": return r.dueMs ? `Draft · due ${weekday(r.dueMs)}` : "Draft";
      case "late": return `Late, was due ${weekday(r.dueMs)}${r.submission ? " · draft" : ""}`;
      case "not-sent": return "Not sent";
      default: {
        const sent = r.submission?.submittedAtMs ?? 0;
        const days = r.dueMs && sent > r.dueMs ? Math.ceil((sent - r.dueMs) / 86_400_000) : 0;
        return `Sent ${weekday(sent)}${days ? ` · ${days} day${days === 1 ? "" : "s"} late` : ""}`;
      }
    }
  }

  const BADGE: Record<CheckinRow["state"], { label: string; cls: string } | null> = {
    due: { label: "Due", cls: "text-warning bg-warning/15" },
    draft: { label: "Draft", cls: "text-warning bg-warning/15" },
    late: { label: "Late", cls: "text-destructive bg-destructive/15" },
    sent: { label: "Sent", cls: "text-muted-foreground bg-muted" },
    reviewed: { label: "Reviewed", cls: "text-success bg-success/15" },
    "not-sent": null,
  };

  function open(r: CheckinRow) {
    if (r.state === "sent" || r.state === "reviewed") void goto(`/checkins/sent/${r.submission!.id}`);
    else if (r.state !== "not-sent") void goto(`/checkins/${r.schedule.id}?period=${r.periodIndex}`);
  }
</script>

{#snippet item(r: CheckinRow, current: boolean)}
  {@const badge = BADGE[r.state]}
  {@const title = current && r.state !== "sent" && r.state !== "reviewed" ? r.schedule.name : checkinPeriodLabel(r, date)}
  <li>
    {#if r.state === "not-sent"}
      <div class="flex min-h-[60px] items-center gap-3 px-3 py-2.5 text-muted-foreground">
        <div class="min-w-0 flex-1"><span class="text-[15px]">{title}</span><p class="mt-0.5 text-[13px]">{line(r)}</p></div>
      </div>
    {:else}
      <button type="button" class="flex min-h-[60px] w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40" onclick={() => open(r)}>
        <div class="min-w-0 flex-1">
          <span class="text-[15px] {current ? 'font-semibold' : ''}">{title}</span>
          <p class="mt-0.5 text-[13px] text-muted-foreground">{line(r)}</p>
        </div>
        {#if badge}<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold {badge.cls}">{badge.label}</span>{/if}
        <span class="shrink-0 text-sm text-muted-foreground">›</span>
      </button>
    {/if}
  </li>
{/snippet}

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/splits")} />
    <h1 class="page-title">Check-ins</h1>
  </PageHeader>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if rows.current.length === 0 && rows.earlier.length === 0}
    <div class="px-3 py-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
      <ClipboardCheck class="h-6 w-6" />
      <p class="text-sm">No check-ins from your coach yet.</p>
    </div>
  {:else}
    {#if rows.current.length}
      <h2 class="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This week</h2>
      <ul class="divide-y divide-border border-y border-border">
        {#each rows.current as r (r.schedule.id + r.periodIndex)}{@render item(r, true)}{/each}
      </ul>
    {/if}
    {#if rows.earlier.length}
      <h2 class="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Earlier</h2>
      <ul class="divide-y divide-border border-y border-border">
        {#each rows.earlier as r (r.schedule.id + r.periodIndex)}{@render item(r, false)}{/each}
      </ul>
    {/if}
  {/if}
</div>
