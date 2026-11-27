<!-- The program on a client's Training tab (canvas PG7): week N of M, its rule and next lighter
     week, this week's days and what's done, swaps. Change program… opens Assign for them only;
     Stop the program asks first. -->
<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import { archiveCoachProgram, getProgramStartMs, ruleLabel, type CoachProgram, type ProgramRule } from "@logit/core/domain/CoachProgram";
  import type { StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";
  import { SWAP_WHY_LABEL, type ProgramSwap } from "@logit/core/domain/swaps";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import type { ProgramStatus } from "../coachingData";
  import { weekdayDate } from "../format";
  import AssignProgramDialog from "../programs/AssignProgramDialog.svelte";
  import RulePickerDialog from "../programs/RulePickerDialog.svelte";

  let { status, clientId, username, name, sessions, swaps, shared, onchange }: {
    status: ProgramStatus | null;
    clientId: string;
    username: string;
    name: string;
    sessions: WorkoutSession[];
    swaps: ProgramSwap[];
    shared: boolean;
    onchange: () => Promise<void> | void;
  } = $props();

  const DAY = 86_400_000;
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
        <Button variant="outline" size="sm" href="/clients/{clientId}/programs/{p.id}?u={username}">Edit their copy</Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label="More for {p.name}"><EllipsisIcon class="size-4" /></Button>{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-52">
            <DropdownMenu.Item onSelect={() => (assigning = true)}>Change program…</DropdownMenu.Item>
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
    {#each swaps.slice(0, 2) as w, i (w.sessionId + i)}
      <p class="text-xs text-muted-foreground"><b class="font-medium text-foreground">Swapped</b> {w.planned} for {w.didInstead} on {WEEKDAYS[new Date(w.startedAtMs).getDay()]} · {SWAP_WHY_LABEL[w.why].toLowerCase()}</p>
    {/each}
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
