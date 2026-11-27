<!-- Send a form (canvas K15): one of your shared forms to one or several clients, once now or on a
     schedule. Each client gets a copy that follows the shared form. A client who doesn't share
     check-ins, or already gets it, is listed and skipped. -->
<script lang="ts">
  import type { ClientSummary } from "$lib/features/coaching/coachingData";
  import { copyForClient, type CheckinCadence, type CheckinSchedule } from "@logit/core/domain/Checkin";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import { DateField } from "$lib/components/ui/date-field";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { getWebCheckinRepo } from "$lib/deps";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { readyMadeForm } from "@logit/core/domain/Checkin";
  import { goto } from "$app/navigation";

  let {
    open = $bindable(false),
    forms,
    copies,
    clients,
    formId = null,
    clientIds = [],
    onsent,
  }: {
    open?: boolean;
    /** Your shared forms (check-ins; the start-up form is sent on its own when someone joins). */
    forms: CheckinSchedule[];
    /** Every client copy, to see who gets a form already: [recipient id, copy]. */
    copies: { recipientUserId: string; schedule: CheckinSchedule }[];
    clients: ClientSummary[];
    formId?: string | null;
    /** Preselected clients; with one, the client list is hidden. */
    clientIds?: string[];
    onsent: () => Promise<void> | void;
  } = $props();

  let pick = $state("");
  let who = $state<Set<string>>(new Set());
  let how = $state<"once" | "weekly" | "monthly">("weekly");
  let first = $state<string | undefined>(undefined);
  let sending = $state(false);

  const today = new Date().toISOString().slice(0, 10);
  $effect(() => {
    if (!open) return;
    pick = formId ?? forms[0]?.id ?? "";
    who = new Set(clientIds);
    const f = forms.find((x) => x.id === pick);
    how = f?.cadence === "monthly" ? "monthly" : f?.cadence === "manual" ? "once" : "weekly";
    first = today;
  });

  const form = $derived(forms.find((f) => f.id === pick) ?? null);
  const fixed = $derived(clientIds.length === 1);
  const has = (clientId: string) => copies.some((c) => c.recipientUserId === clientId && c.schedule.sourceId === pick && !c.schedule.archived);
  const chosen = $derived(clients.filter((c) => who.has(c.id)));
  const skipped = $derived(chosen.filter((c) => !c.sharing.checkins || has(c.id)));
  const sendTo = $derived(chosen.filter((c) => c.sharing.checkins && !has(c.id)));

  async function send() {
    if (!form || !sendTo.length || sending) return;
    sending = true;
    try {
      const cadence: CheckinCadence = how === "once" ? "manual" : how;
      const anchor = how === "once" ? Date.now() : new Date(`${first ?? today}T00:00`).getTime();
      const repo = getWebCheckinRepo();
      await Promise.all(sendTo.map((c) => repo.saveSchedule(copyForClient(form, cadence, anchor), c.username)));
      toast.success(`${form.name} sent to ${sendTo.length === 1 ? sendTo[0]!.name : `${sendTo.length} clients`}`);
      open = false;
      await onsent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      sending = false;
    }
  }

  // The form you want isn't made yet: make it here and go straight to the editor.
  async function makeForm(which: "blank" | "weekly" | "health" | "monthly") {
    const f = which === "blank" ? { ...readyMadeForm("weekly"), name: "New form", questions: [] } : readyMadeForm(which);
    await getWebCheckinRepo().saveSchedule(f);
    open = false;
    toast.success("Form made. Send it from Check-ins › Forms when it's ready.");
    await goto(`/coaching/checkins/forms/${f.id}`);
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(who);
    if (on) next.add(id);
    else next.delete(id);
    who = next;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Send a form{fixed && chosen[0] ? ` to ${chosen[0].name}` : ""}</Dialog.Title>
      <Dialog.Description>Each gets it in their app on the day, with one notification.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <Label for="send-form">Form</Label>
        <div class="flex flex-wrap items-center gap-2">
          {#if forms.length}
            <OptionSelect id="send-form" bind:value={pick} options={forms.map((f) => ({ value: f.id, label: `${f.name} · ${f.questions.length} questions` }))}
              onValueChange={(v) => { const f = forms.find((x) => x.id === v); how = f?.cadence === "monthly" ? "monthly" : f?.cadence === "manual" ? "once" : "weekly"; }} />
          {:else}
            <p class="text-[13px] text-muted-foreground">No check-in forms yet.</p>
          {/if}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="outline">New form</Button>{/snippet}</DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-56">
              <DropdownMenu.Item onSelect={() => void makeForm("blank")}>Blank form</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Label>From LogIt</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={() => void makeForm("weekly")}>Weekly check-in</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void makeForm("health")}>Health questions</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void makeForm("monthly")}>Monthly review</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
      {#if !fixed}
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">Who gets it</legend>
          <div class="flex max-h-56 flex-col overflow-y-auto rounded-[10px] border border-border p-1.5">
            {#each clients as c (c.id)}
              <label class="flex min-h-10 items-center gap-3 rounded-md px-2.5 py-2 text-[13px] hover:bg-muted/50">
                <Checkbox checked={who.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                <span class="flex-1">{c.name}</span>
                {#if !c.sharing.checkins}<span class="text-xs text-muted-foreground">doesn't share check-ins</span>{:else if has(c.id)}<span class="text-xs text-muted-foreground">gets it already</span>{/if}
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}
      {#if form?.kind === "startup"}
        <p class="text-[13px] text-muted-foreground">A start-up form is filled in once.</p>
      {:else}
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">How often</legend>
        <RadioGroup.Root bind:value={how} class="grid grid-cols-3 gap-2">
          {#each [["once", "Once, now"], ["weekly", "Every week"], ["monthly", "Every month"]] as [v, l] (v)}
            <label class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13px] transition-colors {how === v ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}"><RadioGroup.Item value={v} />{l}</label>
          {/each}
        </RadioGroup.Root>
        {#if how !== "once"}
          <span class="flex flex-col gap-2 pt-2"><Label>First one</Label><DateField bind:value={first} minIso={today} aria-label="First one" class="w-auto self-start" /></span>
        {/if}
      </fieldset>
      {/if}
      {#if skipped.length}
        <p class="text-xs text-muted-foreground">Skipped: {skipped.map((c) => `${c.name} (${!c.sharing.checkins ? "doesn't share check-ins" : "gets it already"})`).join(", ")}.</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={!form || !sendTo.length || sending} onclick={() => void send()}>
        {sending ? "Sending…" : sendTo.length === 1 ? `Send to ${sendTo[0]!.name}` : `Send to ${sendTo.length} clients`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
