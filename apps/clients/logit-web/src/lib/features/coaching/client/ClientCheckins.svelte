<!-- A client's Check-ins tab (canvas K11): the forms they get (your shared form, or their own
     version made with "Change for Aoife only"), Send a form, and their check-ins with a column per
     number question, so a coach who asks about sleep sees a sleep column. -->
<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Table from "$lib/components/ui/table/index.js";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type CheckinInboxItem, type Sharing } from "@logit/core/api/coachApi";
  import {
    archiveCheckinSchedule, backToShared, copyForClient, missedCheckin, readyMadeForm,
    type CheckinSchedule, type CheckinSubmission,
  } from "@logit/core/domain/Checkin";
  import { getWebCheckinRepo } from "$lib/deps";
  import NotShared from "./NotShared.svelte";
  import SendFormDialog from "../forms/SendFormDialog.svelte";
  import { parseSubmission, type ClientSummary } from "../coachingData";
  import { shortDate, weekdayDate, when } from "../format";

  let { clientId, username, name, sharing }: { clientId: string; username: string; name: string; sharing: Sharing } = $props();

  let mine = $state<CheckinSchedule[]>([]);
  let shared = $state<CheckinSchedule[]>([]);
  let copies = $state<{ recipientUserId: string; schedule: CheckinSchedule }[]>([]);
  let items = $state<CheckinInboxItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sendOpen = $state(false);
  let busy = $state(false);

  async function load() {
    try {
      const all = await getWebCheckinRepo().listMySchedules();
      // The start-up form too: clients from before you had one can still get it.
      shared = all.filter((r) => !r.recipientUserId && !r.schedule.archived).map((r) => r.schedule);
      copies = all.filter((r) => r.recipientUserId).map((r) => ({ recipientUserId: r.recipientUserId!, schedule: r.schedule }));
      mine = copies.filter((c) => c.recipientUserId === clientId).map((c) => c.schedule).sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAtMs - a.updatedAtMs);
      if (sharing.checkins) items = (await coachApi.checkinInbox(365)).filter((i) => i.clientUserId === clientId);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load check-ins";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  const subs = $derived(items.map(parseSubmission).filter((s): s is CheckinSubmission => s != null));
  const sourceOf = (f: CheckinSchedule) => shared.find((s) => s.id === f.sourceId) ?? null;
  const me: ClientSummary[] = $derived([{ id: clientId, username, name, sharing } as ClientSummary]);

  function cadenceText(s: CheckinSchedule): string {
    if (s.kind === "startup") return "Once, after taking a spot";
    if (s.cadence === "manual") return "Once";
    const day = new Date(s.anchorMs).toLocaleDateString(undefined, { weekday: "long" });
    return s.cadence === "weekly" ? `${day}s` : s.cadence === "biweekly" ? `Every 2 weeks, ${day}s` : "Monthly";
  }

  async function act(work: () => Promise<void>, done: string) {
    busy = true;
    try {
      await work();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      busy = false;
    }
  }

  // With no shared form yet, the first one is LogIt's weekly check-in, shared and sent at once.
  async function sendFirst() {
    await act(async () => {
      const template = readyMadeForm("weekly");
      const repo = getWebCheckinRepo();
      await repo.saveSchedule(template);
      await repo.saveSchedule(copyForClient(template, "weekly", Date.now()), username);
      guideSignal("checkin-form.added");
      // Next: the questions, in the one editor.
      void goto(`/coaching/checkins/forms/${template.id}`);
    }, `Weekly check-in sent to ${name}`);
  }

  // The history table: a column per number question across the forms they answered.
  const columns = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const f of mine) for (const q of f.questions) if (["number", "scale", "weight", "measurement"].includes(q.type) && seen.size < 3) seen.set(q.id, q.prompt.replace(/\s*\(.*\)$/, ""));
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  });
  function cell(i: CheckinInboxItem, qid: string): string {
    const s = parseSubmission(i);
    const a = s?.answers.find((x) => x.questionId === qid);
    if (a?.number === undefined) return "–";
    const q = mine.flatMap((f) => f.questions).find((x) => x.id === qid);
    return q?.type === "weight" ? `${a.number} kg` : q?.type === "measurement" ? `${a.number} cm` : String(a.number);
  }
</script>

{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
{#if loading}
  <Skeleton class="h-48" />
{:else}
  <div class="flex flex-col gap-4">
    <section data-guide="client-forms" class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2 pb-1.5">
        <h2 class="text-sm font-semibold">Forms {name} gets</h2>
        {#if shared.length}
          <Button size="sm" variant="outline" disabled={busy} onclick={() => (sendOpen = true)}>Send a form</Button>
        {:else}
          <Button size="sm" variant="outline" disabled={busy} onclick={() => void sendFirst()}>Send LogIt's weekly check-in</Button>
        {/if}
      </div>
      {#each mine as f (f.id)}
        {@const src = sourceOf(f)}
        {@const m = sharing.checkins ? missedCheckin(f, subs) : null}
        <div class="flex flex-wrap items-center gap-3 border-t border-border py-3">
          <span class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
            <span class="flex items-center gap-2 text-[13px] font-medium">
              {f.name}
              {#if f.archived}<Badge variant="outline">Stopped</Badge>{:else if f.own}<Badge variant="secondary">{name.split(" ")[0]}'s own version</Badge>{/if}
            </span>
            <span class="text-xs {m ? 'text-destructive' : 'text-muted-foreground'}">
              {m ? `Missed: was due ${weekdayDate(m.dueMs)}` : `${cadenceText(f)} · ${f.questions.length} questions${src && !f.own ? " · from your shared form" : ""}`}
            </span>
          </span>
          {#if !f.archived}
            <Button size="sm" variant="outline" href="/coaching/checkins/forms/{f.id}">{f.own || !src ? `Edit ${name.split(" ")[0]}'s` : `Change for ${name.split(" ")[0]} only`}</Button>
            {#if f.own && src}
              <Button size="sm" variant="ghost" disabled={busy} onclick={() => void act(() => getWebCheckinRepo().saveSchedule(backToShared(f, src)), `${name} is back on your shared ${src.name}`)}>Back to shared</Button>
            {/if}
            <Button size="sm" variant="ghost" class="text-destructive" disabled={busy}
              onclick={() => void act(() => getWebCheckinRepo().saveSchedule(archiveCheckinSchedule(f)), `${name} won't get ${f.name} any more`)}>Stop sending</Button>
          {/if}
        </div>
      {:else}
        <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No forms yet. A weekly check-in is a good start.</p>
      {/each}
    </section>

    <section class="flex flex-col rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="pb-1.5 text-sm font-semibold">{name.split(" ")[0]}'s check-ins</h2>
      {#if !sharing.checkins}
        <NotShared {name} what="their check-in answers" note="Your forms still reach their app." />
      {:else if items.length === 0}
        <p class="border-t border-border py-3 text-[13px] text-muted-foreground">No answers yet.</p>
      {:else}
        <div class="overflow-x-auto">
          <Table.Root class="w-full min-w-[520px] text-[13px]">
            <Table.Header>
              <Table.Row class="text-left text-xs text-muted-foreground">
                <Table.Head class="font-medium">Sent</Table.Head>
                <Table.Head class="font-medium">Form</Table.Head>
                {#each columns as col (col.id)}<Table.Head class="font-medium">{col.label}</Table.Head>{/each}
                <Table.Head class="font-medium">Status</Table.Head>
                <Table.Head class="w-20"><span class="sr-only">Open</span></Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each items as i (i.id)}
                {@const f = mine.find((x) => x.id === i.scheduleId)}
                <Table.Row class="border-t border-border">
                  <Table.Cell>{shortDate(i.submittedAtMs)}</Table.Cell>
                  <Table.Cell>{f?.name ?? "Check-in"}</Table.Cell>
                  {#each columns as col (col.id)}<Table.Cell class="tabular-nums">{cell(i, col.id)}</Table.Cell>{/each}
                  <Table.Cell>
                    {#if i.reviewedAtMs}<span class="text-muted-foreground">Reviewed {when(i.reviewedAtMs)}</span>{:else}<span class="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning">To review</span>{/if}
                  </Table.Cell>
                  <Table.Cell>
                    <Button size="sm" variant={i.reviewedAtMs ? "ghost" : "default"} href="/coaching/checkins?f={i.reviewedAtMs ? 'reviewed' : 'review'}&id={encodeURIComponent(i.id)}&client={clientId}">{i.reviewedAtMs ? "Open" : "Review"}</Button>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    </section>
  </div>
{/if}

<SendFormDialog bind:open={sendOpen} forms={shared} {copies} clients={me} clientIds={[clientId]}
  onsent={async () => { guideSignal("checkin-form.added"); await load(); }} />
