<!-- Assign a program (canvas PG6): to one or several clients, each getting their own copy.
     Starts when they tap Start or on a date. A client already on a program chooses: replace it
     now, or start this one when it ends. Opened from Programs, a client's page, or "Change
     program…" on their Training tab. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { DateField } from "$lib/components/ui/date-field";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import XIcon from "@lucide/svelte/icons/x";
  import { goto } from "$app/navigation";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import type { MyCoachProgram } from "@logit/core/data/coachProgramRepo";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import { guideSignal } from "$lib/features/guide/signal";
  import { inView, programStatus } from "../coachingData";
  import { weekdayDate } from "../format";

  let {
    open = $bindable(false),
    program = null,
    clientIds = [],
    onassigned,
  }: {
    open?: boolean;
    /** The program to give; null: pick one from your programs (or start from scratch for one client). */
    program?: CoachProgram | null;
    /** Who it's for to start with. */
    clientIds?: string[];
    onassigned?: () => Promise<void> | void;
  } = $props();

  const DAY = 86_400_000;
  const BLANK = "__blank";
  let clients = $state<ClientRelationship[]>([]);
  let rows = $state<MyCoachProgram[]>([]);
  let chosen = $state<string[]>([]);
  let pick = $state("");
  let startMode = $state<"manual" | "date">("manual");
  let startDate = $state(P.toDateInputValue(P.startOfLocalDayMs() + DAY));
  /** Per client already on a program: replace it now, replace it at the week they're on (canvas
   * FX1: "as if they'd been on it all along"), or start after it ends. */
  let when = $state<Record<string, "replace" | "backdate" | "after">>({});
  let busy = $state(false);
  let loaded = $state(false);
  // Canvas SP2: for one client, a "Check it fits" step between who/when and assigning.
  let step = $state<1 | 2>(1);
  let swaps = $state<Record<string, { exerciseName: string; exerciseId?: string }>>({});
  let findFirst = $state(false);

  $effect(() => {
    if (!open) return;
    chosen = [...clientIds];
    when = {};
    step = 1;
    swaps = {};
    findFirst = false;
    loaded = false;
    void Promise.all([coachApi.listClients(), getWebCoachProgramRepo().listMyPrograms()]).then(([c, r]) => {
      clients = inView(c);
      rows = r;
      pick = program?.id ?? library[0]?.id ?? (chosen.length === 1 ? BLANK : "");
      loaded = true;
    }, () => (loaded = true));
  });

  const library = $derived(rows.filter((r) => r.recipientUserId === null && !r.program.archived).map((r) => r.program).sort((a, b) => a.name.localeCompare(b.name)));
  const giving = $derived(program ?? library.find((p) => p.id === pick) ?? null);
  const nameOf = (c: ClientRelationship) => c.client.displayName || c.client.username;
  const first = (c: ClientRelationship) => nameOf(c).split(" ")[0];
  const people = $derived(chosen.map((id) => clients.find((c) => c.client.id === id)).filter((c): c is ClientRelationship => !!c));
  const others = $derived(clients.filter((c) => !chosen.includes(c.client.id)));

  /** What each chosen client is on now (running, scheduled or waiting to start). */
  const onNow = $derived(new Map(people.map((c) => {
    const live = rows.filter((r) => r.recipientUserId === c.client.id && !r.program.archived)
      .map((r) => programStatus(r.program)).filter((s) => s.state !== "finished");
    const running = live.find((s) => s.state === "running") ?? live[0] ?? null;
    return [c.client.id, running] as const;
  })));

  /** Starting after only works when theirs has an end (it's running or has a start date). */
  const defaultWhen = (cur: { endsAtMs: number | null }): "replace" | "after" => (cur.endsAtMs ? "after" : "replace");

  /** "Starts" only matters for someone not on a program, or replacing it at week 1. */
  const startsMatters = $derived(people.some((c) => {
    const cur = onNow.get(c.client.id);
    return !cur || (when[c.client.id] ?? defaultWhen(cur)) === "replace";
  }));

  const checking = $derived(people.length === 1 && !!giving && pick !== BLANK);
  const plugins = $derived(giving ? giving.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.type === "plugin").map((b) => ({ name: (b as P.ProgramPluginBlock).name, day: d.name ?? "a day" })))) : []);
  const pluginNames = $derived([...new Set(plugins.map((p) => p.name))]);

  async function assign() {
    if (busy || !people.length) return;
    busy = true;
    const repo = getWebCoachProgramRepo();
    try {
      if (pick === BLANK && !program) {
        const c = people[0]!;
        const fresh = P.createCoachProgram(`${nameOf(c)}'s program`);
        const p = P.addDay(fresh, fresh.weeks[0]!.id, "Day 1");
        await repo.saveProgram(p, c.client.username);
        open = false;
        await goto(`/clients/${c.client.id}/programs/${p.id}?u=${c.client.username}`);
        return;
      }
      if (!giving) return;
      // Your how-tos for its exercises go with each copy (canvas HT4).
      const howtos = await allHowTos();
      let done = 0;
      for (const c of people) {
        const current = onNow.get(c.client.id);
        const choice = current ? (when[c.client.id] ?? defaultWhen(current)) : null;
        let start: { mode: "manual" } | { mode: "fixed-date"; startDateMs: number } =
          startMode === "manual" ? { mode: "manual" } : { mode: "fixed-date", startDateMs: P.fromDateInputValue(startDate) ?? P.startOfLocalDayMs() };
        if (current && (choice === "replace" || choice === "backdate")) {
          await repo.saveProgram(P.archiveCoachProgram(current.program), c.client.username);
          const was = P.getProgramStartMs(current.program);
          if (choice === "backdate" && was != null) start = { mode: "fixed-date", startDateMs: was };
        } else if (current && choice === "after" && current.endsAtMs) {
          start = { mode: "fixed-date", startDateMs: P.startOfLocalDayMs(current.endsAtMs) };
        }
        let copy = withHowTos(P.copyProgramForClient(giving, start), howtos);
        // What the fit check changed, in their copy only (canvas SP2).
        if (checking) {
          for (const [from, to] of Object.entries(swaps)) copy = P.renameExercise(copy, from, to);
          if (findFirst) copy = P.addFindWeekFirst(copy);
        }
        await repo.saveProgram(copy, c.client.username);
        done++;
      }
      guideSignal("program.assigned");
      toast.success(done === 1 ? `${giving.name} assigned to ${nameOf(people[0]!)}` : `${giving.name} assigned to ${done} clients`);
      open = false;
      await onassigned?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't assign it");
    } finally {
      busy = false;
    }
  }
  import FitCheck from "./FitCheck.svelte";
  import { allHowTos, withHowTos } from "./howtoData";
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] min-w-0 overflow-y-auto sm:max-w-[520px] [&>*]:min-w-0">
    <Dialog.Header>
      <Dialog.Title>{program ? `Assign ${program.name}` : people.length === 1 ? `Give ${first(people[0]!)} a program` : "Assign a program"}</Dialog.Title>
      <Dialog.Description>Each client gets their own copy. Changing your program later asks which copies to update.</Dialog.Description>
    </Dialog.Header>

    {#if !loaded}
      <p class="text-[13px] text-muted-foreground">Loading…</p>
    {:else if step === 2 && checking && giving}
      {@const c = people[0]!}
      <FitCheck clientId={c.client.id} name={nameOf(c)} sharesWorkouts={c.sharing?.workouts !== false} sharesCheckins={c.sharing?.checkins !== false} program={giving} bind:swaps bind:findFirst />
    {:else}
      <div class="flex flex-col gap-4">
        {#if !program}
          <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Program
            <OptionSelect bind:value={pick} aria-label="Program" class="w-full"
              options={[...library.map((p) => ({ value: p.id, label: `${p.name} · ${P.programSummary(p)}` })), ...(people.length <= 1 ? [{ value: BLANK, label: "Start from scratch, just for them" }] : [])]} />
          </label>
        {/if}

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">To</span>
          <div class="flex flex-wrap items-center gap-1.5">
            {#each people as c (c.client.id)}
              <span class="inline-flex h-8 items-center gap-1 rounded-full bg-muted pl-3 pr-1 text-[13px]">
                {nameOf(c)}
                <button type="button" aria-label="Remove {nameOf(c)}" class="flex size-6 items-center justify-center rounded-full hover:bg-background" onclick={() => (chosen = chosen.filter((x) => x !== c.client.id))}><XIcon class="size-3.5" /></button>
              </span>
            {/each}
            {#if others.length && pick !== BLANK}
              <OptionSelect value="" placeholder="Add a client…" aria-label="Add a client" class="h-8 w-44"
                options={others.map((c) => ({ value: c.client.id, label: nameOf(c) }))}
                onValueChange={(v) => { if (v) chosen = [...chosen, v]; }} />
            {/if}
          </div>
        </div>

        {#if pick !== BLANK}
          {#if startsMatters}
          <div class="flex flex-col gap-1.5">
            <span id="assign-start" class="text-xs font-medium text-muted-foreground">Starts</span>
            <RadioGroup.Root bind:value={startMode} aria-labelledby="assign-start" class="flex flex-col gap-1.5">
              <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] {startMode === 'manual' ? 'border-primary bg-muted' : 'border-border'}">
                <RadioGroup.Item value="manual" /><span>When they tap Start</span>
              </label>
              <label class="flex items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[13px] {startMode === 'date' ? 'border-primary bg-muted' : 'border-border'}">
                <RadioGroup.Item value="date" /><span class="flex-1">On a date</span>
                <DateField bind:value={startDate} aria-label="Start date" disabled={startMode !== "date"} class="h-8 w-auto text-[13px]" />
              </label>
            </RadioGroup.Root>
          </div>
          {/if}

          {#each people as c (c.client.id)}
            {@const cur = onNow.get(c.client.id)}
            {#if cur}
              {@const choice = when[c.client.id] ?? defaultWhen(cur)}
              <div class="flex flex-col gap-2 rounded-[10px] bg-muted px-3.5 py-3 text-[13px]">
                <p>
                  <b class="font-semibold">{first(c)}</b>
                  {cur.state === "running" ? `is ${cur.week} ${cur.week === 1 ? "week" : "weeks"} into ${cur.program.name}` : cur.state === "scheduled" ? `starts ${cur.program.name} ${weekdayDate(cur.startsAtMs!)}` : `has ${cur.program.name} waiting to start`}.
                  {#if cur.endsAtMs}Replace it now, or start {giving?.name ?? "this"} when it ends ({weekdayDate(cur.endsAtMs)})?{:else}Replace it now?{/if}
                </p>
                <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="When {first(c)} starts">
                  <Button size="sm" variant={choice === "replace" ? "default" : "outline"} role="radio" aria-checked={choice === "replace"} onclick={() => (when = { ...when, [c.client.id]: "replace" })}>Replace now, at week 1</Button>
                  {#if cur.state === "running" && (cur.week ?? 1) > 1}
                    <!-- Canvas FX1: the wrong program for a few weeks. -->
                    <Button size="sm" variant={choice === "backdate" ? "default" : "outline"} role="radio" aria-checked={choice === "backdate"} onclick={() => (when = { ...when, [c.client.id]: "backdate" })}>Replace, at week {cur.week}</Button>
                  {/if}
                  {#if cur.endsAtMs}
                    <Button size="sm" variant={choice === "after" ? "default" : "outline"} role="radio" aria-checked={choice === "after"} onclick={() => (when = { ...when, [c.client.id]: "after" })}>After it ends</Button>
                  {/if}
                </div>
                {#if choice === "backdate"}
                  <p class="text-xs text-muted-foreground">As if {first(c)} had been on {giving?.name ?? "it"} all along: it starts on the date {cur.program.name} did.</p>
                {/if}
                {#if cur.state === "running" && choice !== "after"}
                  <p class="text-xs text-muted-foreground">What never changes: their logged sessions stay in their history as done, and their strength estimates and records stay, so the new program starts from their real numbers.</p>
                {/if}
              </div>
            {/if}
          {/each}

          {#if pluginNames.length}
            <div class="rounded-[10px] border border-border px-3.5 py-3 text-[13px]">
              <b class="font-semibold">Uses {pluginNames.length === 1 ? "a plugin" : `${pluginNames.length} plugins`}</b>
              <p class="mt-0.5 text-muted-foreground">{pluginNames.map((n) => `"${n}"`).join(", ")} {pluginNames.length === 1 ? "runs a block" : "run blocks"} in this program. Without {pluginNames.length === 1 ? "it" : "them"} on their phone, {pluginNames.length === 1 ? "that block shows" : "those blocks show"} as a note and the rest of the day works.</p>
            </div>
          {/if}
          <p class="text-xs text-muted-foreground">Clients who don't share workouts can still get it; you just won't see how it goes.</p>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      {#if step === 2}
        <Button variant="outline" onclick={() => (step = 1)}>Back</Button>
      {:else}
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      {/if}
      {#if step === 1 && checking}
        <Button disabled={!people.length} onclick={() => (step = 2)}>Next: check it fits</Button>
      {:else}
      <Button disabled={busy || !people.length || (!giving && pick !== BLANK)} onclick={() => void assign()}>
        {busy ? "Assigning…" : pick === BLANK && !program ? "Create" : people.length > 1 ? `Assign to ${people.length} clients` : "Assign"}
      </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
