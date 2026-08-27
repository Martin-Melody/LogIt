<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, ClipboardCheck } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import type { CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";
  import { currentPeriodIndex } from "@logit/core/domain/Checkin";
  import { getCheckinRepo } from "$lib/data/repoProvider";

  const ui = $state({ loading: true, error: null as string | null });
  let schedules = $state<CheckinSchedule[]>([]);
  let submissions = $state<CheckinSubmission[]>([]);

  function statusFor(s: CheckinSchedule): { label: string; variant: "secondary" | "outline" } {
    const period = currentPeriodIndex(s) ?? 0;
    const sub = submissions.find((x) => x.scheduleId === s.id && x.periodIndex === period);
    if (sub?.submittedAtMs) return { label: "Submitted", variant: "secondary" };
    if (sub) return { label: "Draft", variant: "outline" };
    return { label: s.cadence === "manual" ? "Open" : "Due", variant: "outline" };
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const repo = getCheckinRepo();
      [schedules, submissions] = await Promise.all([repo.listAssignedSchedules(), repo.listSubmissions()]);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load check-ins";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/splits")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Check-ins</h1>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if schedules.length === 0}
    <div class="px-3 py-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
      <ClipboardCheck class="h-6 w-6" />
      <p class="text-sm">No check-ins from your coach yet.</p>
    </div>
  {:else}
    <ul class="divide-y divide-border">
      {#each schedules as s (s.id)}
        {@const status = statusFor(s)}
        <li>
          <button type="button" class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
            onclick={() => void goto(`/checkins/${s.id}`)}>
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium">{s.name}</span>
              <p class="text-xs text-muted-foreground mt-0.5 capitalize">{s.cadence} · {s.questions.length} question{s.questions.length === 1 ? "" : "s"}</p>
            </div>
            <Badge variant={status.variant} class="text-xs px-1.5 py-0 shrink-0">{status.label}</Badge>
            <span class="text-muted-foreground text-sm shrink-0">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
