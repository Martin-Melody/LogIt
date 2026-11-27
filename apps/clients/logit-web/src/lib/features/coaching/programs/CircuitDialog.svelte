<!-- Canvas Q4: a circuit in a program day. Rounds, rest between exercises and rounds, each
     exercise with reps or a time, and how it moves up. Runs with the circuit timer clients
     already have on the phone. Also edits one. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import type { ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { createId } from "@logit/core/domain/ids";
  import { restText, parseRestText, type ProgramCircuit } from "@logit/core/domain/CoachProgram";

  let { open = $bindable(false), dayName, editing = null, index, onsave }: {
    open?: boolean;
    dayName: string;
    /** The circuit to change; null adds a new one. */
    editing?: ProgramCircuit | null;
    index: ExerciseIndex | null;
    onsave: (c: Pick<ProgramCircuit, "rounds" | "memberRestSec" | "roundRestSec" | "members" | "progression">) => void;
  } = $props();

  type Row = { id: string; exerciseName: string; exerciseId?: string; amount: string };
  let rounds = $state(3);
  let memberRest = $state("0:15");
  let roundRest = $state("1:30");
  let rows = $state<Row[]>([]);
  let progression = $state<"same" | "add-round" | "each">("same");
  let adding = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    const c = editing;
    rounds = c?.rounds ?? 3;
    memberRest = c?.memberRestSec != null ? restText(c.memberRestSec) : "0:15";
    roundRest = c?.roundRestSec != null ? restText(c.roundRestSec) : "1:30";
    rows = (c?.members ?? []).map((m) => ({ id: m.id, exerciseName: m.exerciseName, exerciseId: m.exerciseId, amount: m.durationSec ? restText(m.durationSec) : `${m.reps ?? 10}` }));
    progression = c?.progression ?? "same";
    adding = !c;
    error = null;
  });

  /** "15" or "15 reps" → reps; "0:40", "40s", "40 sec" → a timed hold. */
  function amountOf(text: string): { reps?: number; durationSec?: number } | null {
    const t = text.trim().toLowerCase();
    if (/^\d+\s*(reps?)?$/.test(t)) return { reps: Number.parseInt(t, 10) };
    const s = t.match(/^(\d+)\s*(s|sec|secs|seconds)$/);
    if (s) return { durationSec: Number(s[1]) };
    const r = parseRestText(t);
    return r && t.includes(":") ? { durationSec: r } : null;
  }

  function save() {
    const members: ProgramCircuit["members"] = [];
    for (const r of rows) {
      const a = amountOf(r.amount);
      if (!a) {
        error = `${r.exerciseName}: use reps (15) or a time (0:40).`;
        return;
      }
      members.push({ id: r.id, exerciseName: r.exerciseName, ...(r.exerciseId ? { exerciseId: r.exerciseId } : {}), ...a });
    }
    if (members.length < 2) {
      error = "A circuit needs two exercises or more.";
      return;
    }
    const mr = parseRestText(memberRest), rr = parseRestText(roundRest);
    if (mr === null || rr === null) {
      error = "Rest: use 0:15 or 90.";
      return;
    }
    onsave({ rounds: Math.max(1, Math.min(20, Math.round(rounds))), memberRestSec: mr, roundRestSec: rr, members, progression });
    open = false;
  }

  const fieldCls = "h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-[13px]";
  const MOVES = [
    { value: "same", label: "Same every week" },
    { value: "add-round", label: "+1 round every 2 weeks" },
    { value: "each", label: "Each exercise's own rule" },
  ] as const;
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{editing ? "Circuit" : "New circuit"} on {dayName}</Dialog.Title>
      <Dialog.Description>Runs with the circuit timer clients already have on the phone (rounds, rest, timed holds).</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-3 items-end gap-3">
        <div class="flex flex-col gap-1.5"><Label for="ci-rounds">Rounds</Label>
          <span class="flex h-9 items-center gap-1.5">
            <Button variant="outline" size="icon" class="size-8" aria-label="One round fewer" disabled={rounds <= 1} onclick={() => (rounds -= 1)}>−</Button>
            <span id="ci-rounds" class="w-6 text-center tabular-nums">{rounds}</span>
            <Button variant="outline" size="icon" class="size-8" aria-label="One round more" disabled={rounds >= 20} onclick={() => (rounds += 1)}>+</Button>
          </span>
        </div>
        <div class="flex flex-col gap-1.5"><Label for="ci-mrest">Rest between exercises</Label><input id="ci-mrest" class={fieldCls} bind:value={memberRest} placeholder="0:15" /></div>
        <div class="flex flex-col gap-1.5"><Label for="ci-rrest">Rest between rounds</Label><input id="ci-rrest" class={fieldCls} bind:value={roundRest} placeholder="1:30" /></div>
      </div>

      <div class="flex flex-col">
        <div class="grid grid-cols-[1fr_7rem_2rem] gap-2 pb-1 text-xs font-medium text-muted-foreground"><span>Exercise</span><span>Each round</span><span></span></div>
        {#each rows as r, i (r.id)}
          <div class="grid grid-cols-[1fr_7rem_2rem] items-center gap-2 border-t border-border py-1.5 text-[13px]">
            <span class="truncate font-medium">{r.exerciseName}</span>
            <input class="h-8 rounded-[7px] border border-input bg-background px-2" aria-label="{r.exerciseName} each round" bind:value={rows[i]!.amount} placeholder="15 or 0:40" />
            <Button variant="ghost" size="icon" class="size-8" aria-label="Remove {r.exerciseName}" onclick={() => (rows = rows.filter((x) => x.id !== r.id))}>×</Button>
          </div>
        {/each}
        {#if adding}
          <div class="border-t border-border pt-2">
            <NamePicker id="ci-add" label="Exercise" placeholder="Search exercises" autofocus
              search={(q) => (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }))}
              onPick={(n) => { rows = [...rows, { id: createId("cm"), exerciseName: n, exerciseId: index?.get(n)?.id, amount: /plank|hold|hang|carry|sprint|bike|rower|\brun\b/i.test(n) ? "0:30" : "10" }]; }}
              onCancel={() => (adding = false)} />
          </div>
        {:else}
          <Button variant="outline" size="sm" class="mt-2 self-start" onclick={() => (adding = true)}>+ Exercise</Button>
        {/if}
      </div>

      <div class="flex flex-col gap-1.5">
        <Label>How it moves up</Label>
        <RadioGroup.Root value={progression} onValueChange={(v) => (progression = v as typeof progression)} class="flex flex-col gap-1.5">
          {#each MOVES as m (m.value)}
            <label class="flex items-center gap-2 text-[13px]"><RadioGroup.Item value={m.value} aria-label={m.label} />{m.label}</label>
          {/each}
        </RadioGroup.Root>
      </div>
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={save}>{editing ? "Save circuit" : "Add circuit"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
