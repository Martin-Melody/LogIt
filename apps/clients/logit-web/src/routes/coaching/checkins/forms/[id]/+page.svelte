<!-- Check-ins › Forms › a form (canvas F2): a shared form, a client's own version ("Edit hers",
     ?client=), or "ask" for the questions people answer when they ask to be coached. Saves as
     you go; a shared form's changes go on to every client copy that follows it. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { coachApi } from "@logit/core/api/coachApi";
  import type { CoachIntake } from "@logit/core/domain/coachRequest";
  import { followTemplate, makeOwn, type CheckinSchedule } from "@logit/core/domain/Checkin";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { getWebCheckinRepo } from "$lib/deps";
  import FormEditor from "$lib/features/coaching/forms/FormEditor.svelte";
  import { askToForm, formToAsk } from "$lib/features/coaching/forms/askForm";

  const id = $derived(page.params.id ?? "");
  let form = $state<CheckinSchedule | null>(null);
  let intake = $state<CoachIntake | null>(null);
  let recipient = $state<string | null>(null);
  let clientName = $state<string | null>(null);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: CheckinSchedule | null = null;

  onMount(async () => {
    try {
      if (id === "ask") {
        intake = await coachApi.getIntake();
        form = askToForm(intake.questions);
        return;
      }
      const row = await getWebCheckinRepo().getMySchedule(id);
      if (!row) throw new Error("This form doesn't exist any more.");
      form = row.schedule;
      recipient = row.recipientUserId;
      if (recipient) {
        const c = (await coachApi.listClients()).find((x) => x.client.id === recipient);
        clientName = c ? c.client.displayName || c.client.username : "this client";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't open the form";
    }
  });

  function changed(next: CheckinSchedule) {
    // A client's copy edited here becomes theirs: the shared form's changes skip it.
    pending = recipient && next.sourceId && !next.own ? makeOwn(next) : next;
    if (pending !== next) form = pending;
    clearTimeout(timer);
    saving = true;
    timer = setTimeout(() => void flush(), 700);
  }

  async function flush() {
    const next = pending;
    pending = null;
    if (!next) return;
    try {
      if (id === "ask") {
        intake = await coachApi.saveIntake({ spots: intake!.spots, whenFull: intake!.whenFull, expectSpots: intake!.expectSpots, questions: formToAsk(next) });
      } else {
        const repo = getWebCheckinRepo();
        await repo.saveSchedule(next);
        if (!recipient) {
          // Clients' copies that follow this form take its questions (their own schedule stays).
          const copies = (await repo.listMySchedules()).filter((r) => r.recipientUserId && r.schedule.sourceId === next.id && !r.schedule.own);
          await Promise.all(copies.map((r) => repo.saveSchedule(followTemplate(r.schedule, next))));
        }
      }
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      saving = !!pending;
    }
  }
  onDestroy(() => {
    clearTimeout(timer);
    void flush();
  });

  const note = $derived(
    id === "ask" ? "Shown when someone taps Ask to be coached on your profile or a link. Written answers and choices only."
      : recipient ? `${clientName}'s own version: changes here are only for ${clientName}, and changes to the shared form skip it.`
      : form?.kind === "startup" ? "New clients fill it in once, after they take a spot. Set in Profile › When someone becomes your client."
      : "A check-in form. Choose who gets it from Check-ins › Forms or a client's Check-ins tab.",
  );
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Check-ins", href: "/coaching/checkins" }, { label: "Forms", href: "/coaching/checkins?f=forms" }, { label: form?.name ?? "Form" }]} />
  {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
  {#if !form && !error}
    <Skeleton class="h-96" />
  {:else if form}
    <FormEditor bind:form mode={id === "ask" ? "ask" : "form"} {note} {saving} clientName={clientName ?? (id === "ask" ? "someone asking" : "your client")} onchange={changed} />
    {#if recipient}<Button variant="outline" class="self-start" href="/clients/{recipient}?tab=checkins">Back to {clientName}</Button>{/if}
  {/if}
</div>
