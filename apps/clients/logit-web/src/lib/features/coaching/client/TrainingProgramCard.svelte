<!-- The program on a client's Training tab (canvas PG7): week N of M, its rule and next lighter
     week, this week's days and what's done, swaps. Change program… opens Assign for them only;
     Stop the program asks first. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import { archiveCoachProgram, getProgramStartMs, renameExercise, revertSwap, ruleLabel, type CoachProgram, type ProgramRule } from "@logit/core/domain/CoachProgram";
  import { activeLastingSwaps } from "@logit/core/domain/swaps";
  import { pluginsNeeded } from "@logit/core/domain/programPlan";
  import type { PluginConsent } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import type { StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";
  import { SWAP_WHY_LABEL, type ProgramSwap } from "@logit/core/domain/swaps";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import type { ProgramStatus } from "../coachingData";
  import { weekdayDate } from "../format";
  import AssignProgramDialog from "../programs/AssignProgramDialog.svelte";
  import RulePickerDialog from "../programs/RulePickerDialog.svelte";

  let { status, clientId, relationshipId, username, name, sessions, swaps, shared, onchange, pluginConsent = {} }: {
    status: ProgramStatus | null;
    clientId: string;
    relationshipId: string;
    username: string;
    name: string;
    sessions: WorkoutSession[];
    swaps: ProgramSwap[];
    shared: boolean;
    /** Canvas PG8: what they said about the plugins the program uses. */
    pluginConsent?: PluginConsent;
    onchange: () => Promise<void> | void;
  } = $props();

  const DAY = 86_400_000;
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Canvas EQ1: when their plan outgrows their gym, told ahead with what should happen.
  let places = $state<Place[]>([]);
  let bringsPin = $state(false);
  $effect(() => {
    if (!shared) return;
    void syncApi.pullPlaces(0, clientId).then((r) => (places = r.places.flatMap((x) => (x.dataJson && !x.deletedAtMs ? [JSON.parse(x.dataJson) as Place] : []))), () => (places = []));
    void syncApi.pullProfile(clientId).then((r) => (bringsPin = parseKit(r.profile?.kitJson).includes("pin")), () => {});
  });
  const limits = $derived.by(() => {
    if (!p || status?.state !== "running") return [];
    const known = knownLifts(sessions, Date.now(), 180);
    const e1rm = (n: string) => known.find((k) => k.name.toLowerCase() === n.toLowerCase())?.e1rm ?? relatedEstimate(n, known)?.e1rmKg ?? null;
    return gymLimits(p, usualGym(places), { e1rm: withHandoffs(p, e1rm) }, status.week ?? 1).filter((l) => !l.decided);
  });
  let limitOpen = $state(false);
  let limit = $state<GymLimit | null>(null);
  async function pickLimit(choice: { atTop: NonNullable<ProgramStrength["atTop"]> } | { swapFrom: number; exerciseName: string; exerciseId?: string }) {
    if (!p || !limit) return;
    const id = limit.blockId;
    let next: CoachProgram;
    if ("atTop" in choice) {
      next = { ...p, weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id && b.type === "strength" ? { ...b, atTop: choice.atTop } : b)) })) })) };
    } else {
      next = p;
      for (const w of p.weeks) for (const d of w.days) if (d.blocks.some((b) => b.id === id)) next = replaceFromWeek(next, w.id, d.id, id, choice.swapFrom, { exerciseName: choice.exerciseName, exerciseId: choice.exerciseId }, createId("pblock"));
    }
    await getWebCoachProgramRepo().saveProgram({ ...next, updatedAtMs: Date.now() }, username);
    toast.success("Saved in their copy");
    await onchange();
  }
  const first = $derived(name.split(" ")[0]);
  let assigning = $state(false);
  let stopping = $state(false);
  // Their copy can follow its own rule (canvas PG4 per-client override).
  let pickingRule = $state(false);
  async function setRule(rule: ProgramRule | null) {
    if (!p) return;
    try {
      await getWebCoachProgramRepo().saveProgram({ ...p, rule: rule ?? { kind: "fixed" }, updatedAtMs: Date.now() }, username);
      toast.success(`${first}'s copy follows ${ruleLabel(rule ?? { kind: "fixed" })} now`);
      await onchange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }

  const p = $derived(status?.program ?? null);
  const start = $derived(p ? getProgramStartMs(p) : null);
  const weekStart = $derived(start != null && status?.week ? start + (status.week - 1) * 7 * DAY : null);
  const week = $derived(p && status?.week ? p.weeks.find((w) => w.weekNumber === status.week) ?? null : null);
  const nextLighter = $derived(p && status?.week ? p.weeks.filter((w) => w.lighter && w.weekNumber >= status.week!).map((w) => w.weekNumber)[0] ?? null : null);

  /** This week's session for a program day, if they've done it. */
  function doneFor(dayId: string): WorkoutSession | null {
    if (!p || weekStart == null) return null;
    return sessions.find((s) => s.source?.kind === "program" && s.source.parentId === p.id && s.source.dayId === dayId
      && s.startedAtMs >= weekStart && s.startedAtMs < weekStart + 7 * DAY) ?? null;
  }
  function planned(day: CoachProgram["weeks"][number]["days"][number]): number {
    return day.blocks.reduce((n, b) => n + (b.type === "strength" ? b.sets.filter((s) => s.setType !== "warmup").length : 0), 0);
  }
  function doneSets(s: WorkoutSession): number {
    return s.blocks.reduce((n, b) => n + (b.type === "strength" ? (b.data as StrengthBlockData).sets.filter((x) => x.completed !== false && (x.reps ?? 0) > 0 && x.setType !== "warmup").length : 0), 0);
  }

  const needed = $derived(p ? pluginsNeeded(p) : []);
  // Canvas W3: in its last two weeks, or over.
  const endingSoon = $derived(!!status && (status.state === "finished" || (status.state === "running" && status.endsAtMs != null && status.endsAtMs - Date.now() <= 14 * 86_400_000)));

  // Canvas Q8: a lasting swap, kept (their copy says it now) or put back (and they're told).
  const active = $derived(p ? activeLastingSwaps(p, sessions) : []);
  let puttingBack = $state<{ from: string; to: string } | null>(null);
  async function keep(from: string, to: string) {
    if (!p) return;
    try {
      await getWebCoachProgramRepo().saveProgram(renameExercise(p, from, { exerciseName: to }), username);
      // Telling them also takes it off Today.
      await messagesApi.send({
        relationshipId, messageId: createId("msg"), createdAtMs: Date.now(),
        body: `${to} is in your program now, instead of ${from}.`,
        kind: "program-swap", cardJson: JSON.stringify({ programId: p.id, from, to }),
      });
      toast.success(`${first}'s program says ${to} now. ${first} has been told.`);
      await onchange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change it");
    }
  }
  async function putBack() {
    const s = puttingBack;
    puttingBack = null;
    if (!p || !s) return;
    try {
      await getWebCoachProgramRepo().saveProgram(revertSwap(p, s.from, s.to), username);
      await messagesApi.send({
        relationshipId, messageId: createId("msg"), createdAtMs: Date.now(),
        body: `I've put ${s.from} back in your program, instead of ${s.to}.`,
        kind: "program-swap", cardJson: JSON.stringify({ programId: p.id, from: s.to, to: s.from }),
      });
      toast.success(`${s.from} is back. ${first} has been told.`);
      await onchange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't put it back");
    }
  }

  async function stop() {
    if (!p) return;
    try {
      await getWebCoachProgramRepo().saveProgram(archiveCoachProgram(p), username);
      toast.success(`${p.name} stopped. Workouts ${first} already logged stay.`);
      stopping = false;
      await onchange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop it");
    }
  }
  import GymLimitDialog from "./GymLimitDialog.svelte";
  import { syncApi } from "@logit/core/api/syncApi";
  import { parseKit } from "@logit/core/domain/kit";
  import { gymLimits, usualGym, type GymLimit } from "@logit/core/domain/gymLimits";
  import { knownLifts, relatedEstimate } from "@logit/core/domain/relatedLifts";
  import { replaceFromWeek, withHandoffs, type ProgramStrength } from "@logit/core/domain/CoachProgram";
  import type { Place } from "@logit/core/domain/place";
</script>

<section class="flex flex-col gap-3 rounded-[12px] border border-border bg-card px-[18px] py-4">
  {#if p && status}
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-[17px] font-bold">{p.name}{#if status.state === "running"}<span class="font-normal text-muted-foreground"> · week {status.week} of {status.totalWeeks}</span>{/if}</h2>
        <p class="text-xs text-muted-foreground">
          Their copy ·
          {status.state === "running" && start ? `started ${weekdayDate(start)}` : status.state === "scheduled" ? `starts ${weekdayDate(status.startsAtMs!)}` : "waiting for them to tap Start"}
          · {ruleLabel(p.rule)}{nextLighter ? ` · next lighter week: week ${nextLighter}` : ""}
        </p>
      </div>
      <span class="flex items-center gap-1.5">
        {#if endingSoon}<Button size="sm" href="/clients/{clientId}/next-block">Plan next block</Button>{/if}
        <Button variant="outline" size="sm" href="/clients/{clientId}/programs/{p.id}?u={username}">Edit their copy</Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="More for {p.name}"><EllipsisIcon class="size-4" /></Button>{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-52">
            <DropdownMenu.Item onSelect={() => (assigning = true)}>Change program…</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => void goto(`/clients/${clientId}/next-block`)}>Plan the next block…</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => (pickingRule = true)}>Change {first}'s rule…</DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item class="text-destructive" onSelect={() => (stopping = true)}>Stop the program…</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </span>
    </div>

    {#if week && status.state === "running"}
      <div class="flex flex-col">
        <h3 class="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This week</h3>
        {#each [...week.days].sort((a, b) => a.orderIndex - b.orderIndex) as d, i (d.id)}
          {@const s = shared ? doneFor(d.id) : null}
          <div class="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px]">
            <span><b class="font-medium">{d.name ?? `Day ${i + 1}`}</b>{#if d.weekday != null}<span class="text-muted-foreground"> {WEEKDAYS[d.weekday]}</span>{/if}</span>
            <span class={s ? "text-success" : "text-muted-foreground"}>{s ? `Done · ${doneSets(s)} of ${planned(d)} sets` : shared ? "Planned" : ""}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#each needed as n (n.pluginId)}
      {@const c = pluginConsent[n.pluginId]}
      {#if c?.state !== "allowed"}
        <!-- Canvas PG8: what runs on their phone, and what doesn't. -->
        <p class="flex items-start gap-2 rounded-[9px] bg-muted px-3 py-2 text-[13px]">
          <span class="flex-1"><b class="font-medium">{c?.state === "removed" ? `${n.name} was removed from ${first}'s phone` : c?.state === "declined" ? `${first} hasn't allowed ${n.name}` : `${first} hasn't been asked about ${n.name} yet`}</b>
            <span class="block text-xs text-muted-foreground">{n.kind === "block" ? "Until then the block is a note in their workout." : "Until then those exercises repeat last time's numbers."}{c ? "" : " They're asked when they open the program on their phone."}</span></span>
        </p>
      {/if}
    {/each}
    {#each limits as l (l.blockId)}
      <p class="flex items-start gap-2 rounded-[9px] border border-warning/40 bg-warning/5 px-3 py-2 text-[13px]">
        <span class="flex-1"><b class="font-medium">{l.exerciseName} outgrows {first}'s gym in week {l.week}</b>
          <span class="block text-xs text-muted-foreground">{l.what === "dumbbells" ? `Heaviest dumbbells at ${l.placeName}: ${l.topKg} kg` : `${l.what} at ${l.placeName} goes to ${l.topKg} kg`}; the plan reaches {l.plannedKg} kg. If you do nothing, the weight stays there and the reps go up.</span></span>
        <Button size="sm" onclick={() => { limit = l; limitOpen = true; }}>Decide</Button>
      </p>
    {/each}
    {#if swaps.length}
      <!-- Canvas Q8: their swaps; a lasting one asks to be kept or put back. -->
      <div class="flex flex-col">
        <h3 class="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{first}'s swaps</h3>
        {#each swaps as w, i (w.sessionId + i)}
          {@const live = w.lasting && active.some((l) => l.from.trim().toLowerCase() === w.planned.trim().toLowerCase() && l.to === w.didInstead)}
          <div class="flex flex-col gap-1.5 border-t border-border py-2 text-[13px]">
            <span><b class="font-medium">{w.planned} → {w.didInstead}</b> <span class="text-muted-foreground">· {w.lasting ? "for the rest of the program" : "just that day"} · {WEEKDAYS[new Date(w.startedAtMs).getDay()]} {new Date(w.startedAtMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span></span>
            {#if w.reason}<span class="text-muted-foreground">"{w.reason}"</span>{/if}
            <span class="text-xs text-muted-foreground">{SWAP_WHY_LABEL[w.why]}</span>
            {#if live}
              <span class="flex flex-wrap gap-1.5">
                <Button size="sm" onclick={() => void keep(w.planned, w.didInstead)}>Keep it</Button>
                <Button size="sm" variant="outline" onclick={() => (puttingBack = { from: w.planned, to: w.didInstead })}>Put {w.planned} back…</Button>
                <Button size="sm" variant="outline" href="/messages?c={relationshipId}">Message</Button>
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold">No program from you</h2>
        <p class="text-[13px] text-muted-foreground">{first} is training on their own plan.</p>
      </div>
      <Button size="sm" onclick={() => (assigning = true)}>Give {first} a program</Button>
    </div>
  {/if}
</section>

<AssignProgramDialog bind:open={assigning} clientIds={[clientId]} onassigned={onchange} />
<RulePickerDialog bind:open={pickingRule} current={p?.rule ?? null} onpick={(rule) => void setRule(rule)} />

<AlertDialog.Root open={!!puttingBack} onOpenChange={(o) => { if (!o) puttingBack = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Put {puttingBack?.from} back?</AlertDialog.Title>
      <AlertDialog.Description>{first}'s later days go back to {puttingBack?.from} instead of {puttingBack?.to}, and {first} gets a message saying so.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void putBack()}>Put it back</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={stopping}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Stop {p?.name}?</AlertDialog.Title>
      <AlertDialog.Description>It leaves {first}'s phone. Workouts they already logged stay, and it moves to Finished or ended on their Programs tab.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={() => void stop()}>Stop the program</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

{#if limit}
  <GymLimitDialog bind:open={limitOpen} {limit} {first} {bringsPin} onpick={pickLimit} />
{/if}
