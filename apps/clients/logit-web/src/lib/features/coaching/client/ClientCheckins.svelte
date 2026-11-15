<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { coachApi, type CheckinInboxItem, type Sharing } from "@logit/core/api/coachApi";
  import { createCheckinSchedule, missedCheckin, type CheckinSchedule, type CheckinSubmission } from "@logit/core/domain/Checkin";
  import { getWebCheckinRepo } from "$lib/deps";
  import NotShared from "./NotShared.svelte";
  import { parseSubmission } from "../coachingData";
  import { shortDate, weekdayDate, when } from "../format";

  let { clientId, username, name, sharing }: { clientId: string; username: string; name: string; sharing: Sharing } = $props();

  let forms = $state<CheckinSchedule[]>([]);
  let items = $state<CheckinInboxItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let creating = $state(false);

  onMount(async () => {
    try {
      forms = (await getWebCheckinRepo().listMySchedules({ recipientId: clientId })).map((s) => s.schedule);
      if (sharing.checkins) items = (await coachApi.checkinInbox(365)).filter((i) => i.clientUserId === clientId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load check-ins";
    } finally {
      loading = false;
    }
  });

  const subs = $derived(items.map(parseSubmission).filter((s): s is CheckinSubmission => s != null));

  function cadenceText(s: CheckinSchedule): string {
    if (s.cadence === "manual") return "When you ask";
    const day = new Date(s.anchorMs).toLocaleDateString(undefined, { weekday: "long" });
    return s.cadence === "weekly" ? `Weekly, from ${day}s` : s.cadence === "biweekly" ? `Every 2 weeks, from ${day}s` : "Monthly";
  }

  async function newForm() {
    creating = true;
    try {
      const s = createCheckinSchedule("Weekly check-in");
      await getWebCheckinRepo().saveSchedule(s, username);
      await goto(`/clients/${clientId}/checkins/${s.id}?u=${username}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create the form";
      creating = false;
    }
  }
</script>

{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
{#if loading}
  <Skeleton class="h-48" />
{:else}
  <div class="flex flex-wrap items-start gap-4">
    <section class="flex min-w-0 flex-[2_1_480px] flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="pb-1.5 text-sm font-semibold">Answers</h2>
      {#if !sharing.checkins}
        <NotShared {name} what="their check-in answers" note="Your forms still reach their app." />
      {:else}
        {#each items as i (i.id)}
          {@const f = forms.find((x) => x.id === i.scheduleId)}
          <a href="/coaching/checkins?f={i.reviewedAtMs ? 'reviewed' : 'review'}&id={encodeURIComponent(i.id)}&client={clientId}" class="flex items-center justify-between gap-3 border-t border-border py-2.5 text-[13px] hover:opacity-90">
            <span><span class="font-medium">{f?.name ?? "Check-in"}</span> <span class="text-muted-foreground">· week of {shortDate(parseSubmission(i)?.periodStartMs ?? i.submittedAtMs)}</span></span>
            {#if i.reviewedAtMs}<span class="text-xs text-muted-foreground">Reviewed {when(i.reviewedAtMs)}</span>{:else}<span class="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">To review</span>{/if}
          </a>
        {:else}
          <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No answers yet.</p>
        {/each}
      {/if}
    </section>

    <section class="flex flex-[1_1_300px] flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div class="flex items-baseline justify-between pb-1.5">
        <h2 class="text-sm font-semibold">Forms</h2>
        <button type="button" disabled={creating} onclick={newForm} class="h-[30px] rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Add form</button>
      </div>
      {#each forms as f (f.id)}
        {@const m = sharing.checkins ? missedCheckin(f, subs) : null}
        <a href="/clients/{clientId}/checkins/{f.id}?u={username}" class="flex flex-col gap-0.5 border-t border-border py-2.5 text-[13px] hover:opacity-90">
          <span class="flex justify-between gap-2"><span class="font-medium">{f.name}{f.archived ? " (archived)" : ""}</span><span class="text-xs text-muted-foreground">Edit</span></span>
          <span class="text-xs {m ? 'text-destructive' : 'text-muted-foreground'}">{m ? `Missed: was due ${weekdayDate(m.dueMs)}` : `${cadenceText(f)} · ${f.questions.length} question${f.questions.length === 1 ? "" : "s"}`}</span>
        </a>
      {:else}
        <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No forms yet. A weekly form is a good start.</p>
      {/each}
    </section>
  </div>
{/if}
