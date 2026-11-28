<!-- A superset or circuit on a program day (canvas PB15/PB16, builder round 2): the old circuit
     dialog for both. Rounds, rest between exercises and rounds, each exercise's amount per round,
     + Exercise, and how it moves up. Each exercise still opens in the day for everything else. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import type { ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { createId } from "@logit/core/domain/ids";
  import { restText, parseRestText, type GroupDraft } from "@logit/core/domain/CoachProgram";

  let { open = $bindable(false), dayName, draft, fallback, isNew = false, index, onsave }: {
    open?: boolean;
    dayName: string;
    /** What's there now (or the new group's starting point). */
    draft: GroupDraft;
    /** "Superset" / "Circuit" / "Tri-set" when it has no name. */
    fallback: string;
    isNew?: boolean;
    index: ExerciseIndex | null;
    onsave: (d: GroupDraft) => void;
  } = $props();

  type Row = { key: string; blockId?: string; exerciseName: string; exerciseId?: string; amount: string };
  let kind = $state<"superset" | "circuit">("circuit");
  let name = $state("");
  let rounds = $state(3);
  let memberRest = $state("");
  let roundRest = $state("");
  let rows = $state<Row[]>([]);
  let progression = $state<GroupDraft["progression"]>("same");
  let adding = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    const d = draft;
    kind = d.kind;
    name = d.name ?? "";
    rounds = d.rounds || 3;
    memberRest = d.memberRestSec != null ? restText(d.memberRestSec) : "";
    roundRest = d.roundRestSec != null ? restText(d.roundRestSec) : "";
    rows = d.members.map((m) => ({ key: m.blockId ?? createId("gm"), blockId: m.blockId, exerciseName: m.exerciseName, exerciseId: m.exerciseId, amount: m.durationSec ? restText(m.durationSec) : m.reps != null ? `${m.reps}` : "" }));
    progression = d.progression;
    adding = false;
    error = null;
  });

  /** "15" or "15 reps" → reps; "0:40", "40s" → a timed hold; empty keeps what it has. */
  function amountOf(text: string): { reps?: number; durationSec?: number } | null {
    const t = text.trim().toLowerCase();
    if (!t) return {};
    if (/^\d+\s*(reps?)?$/.test(t)) return { reps: Number.parseInt(t, 10) };
    const s = t.match(/^(\d+)\s*(s|sec|secs|seconds)$/);
    if (s) return { durationSec: Number(s[1]) };
    const r = parseRestText(t);
    return r && t.includes(":") ? { durationSec: r } : null;
  }

  function save() {
    const members: GroupDraft["members"] = [];
    for (const r of rows) {
      const a = amountOf(r.amount);
      if (!a) { error = `${r.exerciseName}: use reps (15) or a time (0:40).`; return; }
      members.push({ ...(r.blockId ? { blockId: r.blockId } : {}), exerciseName: r.exerciseName, ...(r.exerciseId ? { exerciseId: r.exerciseId } : {}), ...a });
    }
    if (members.length < 2) { error = `A ${kind} needs two exercises or more.`; return; }
    const mr = memberRest.trim() ? parseRestText(memberRest) : undefined;
    const rr = roundRest.trim() ? parseRestText(roundRest) : undefined;
    if (mr === null || rr === null) { error = "Rest: use 0:15 or 90."; return; }
    onsave({ kind, name: name.trim() || undefined, rounds, memberRestSec: mr, roundRestSec: rr, progression, members });
    open = false;
  }

  const fieldCls = "h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-[13px]";
  const MOVES = [
    { value: "same", label: "Same every week", sub: "" },
    { value: "add-round", label: "+1 round every 2 weeks", sub: "" },
    { value: "each", label: "Each exercise's own progression", sub: "Their weights and reps move up as set on each exercise." },
  ] as const;
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{isNew ? "New " : ""}{kind === "circuit" ? "Circuit" : "Superset"} on {dayName}</Dialog.Title>
      <Dialog.Description>{kind === "circuit" ? "Runs with the circuit timer on their phone: each exercise, then the next, round after round." : "Back to back with no timer between exercises: A, B, then rest."}</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <ToggleGroup.Root type="single" variant="outline" spacing={2} class="justify-start" value={kind} onValueChange={(v: string) => { if (v) kind = v as typeof kind; }} aria-label="Type">
        {#each [["superset", "Superset"], ["circuit", "Circuit"]] as [v, l] (v)}
          <ToggleGroup.Item value={v} class="h-9 rounded-full px-3.5 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{l}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <div class="flex flex-col gap-1.5"><Label for="gr-name">Name <span class="font-normal text-muted-foreground">optional</span></Label><Input id="gr-name" bind:value={name} placeholder={kind === "circuit" ? "Circuit" : fallback} maxlength={40} /></div>
      <div class="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
        <div class="flex flex-col gap-1.5"><Label for="gr-rounds">Rounds</Label>
          <span class="flex h-9 items-center gap-1.5">
            <Button variant="outline" size="icon" class="size-9" aria-label="One round fewer" disabled={rounds <= 1} onclick={() => (rounds -= 1)}>−</Button>
            <span id="gr-rounds" class="w-6 text-center tabular-nums">{rounds}</span>
            <Button variant="outline" size="icon" class="size-9" aria-label="One round more" disabled={rounds >= 20} onclick={() => (rounds += 1)}>+</Button>
          </span>
        </div>
        <div class="flex flex-col gap-1.5"><Label for="gr-mrest">Rest between exercises</Label><input id="gr-mrest" class={fieldCls} bind:value={memberRest} placeholder={kind === "circuit" ? "0:15" : "None"} /></div>
        <div class="flex flex-col gap-1.5"><Label for="gr-rrest">Rest between rounds</Label><input id="gr-rrest" class={fieldCls} bind:value={roundRest} placeholder={kind === "circuit" ? "1:30" : "2:00"} /></div>
      </div>

      <div class="flex flex-col">
        <div class="grid grid-cols-[1fr_7rem_2.25rem] gap-2 pb-1 text-xs font-medium text-muted-foreground"><span>Exercise</span><span>Each round</span><span></span></div>
        {#each rows as r, i (r.key)}
          <div class="grid grid-cols-[1fr_7rem_2.25rem] items-center gap-2 border-t border-border py-1.5 text-[13px]">
            <span class="truncate font-medium">{r.exerciseName}</span>
            <input class="h-9 rounded-[7px] border border-input bg-background px-2" aria-label="{r.exerciseName} each round" bind:value={rows[i]!.amount} placeholder="15 or 0:40" />
            <Button variant="ghost" size="icon" class="size-9" aria-label="Take {r.exerciseName} out" onclick={() => (rows = rows.filter((x) => x.key !== r.key))}>×</Button>
          </div>
        {/each}
        {#if adding}
          <div class="border-t border-border pt-2">
            <NamePicker id="gr-add" label="Exercise" placeholder="Search exercises" autofocus
              search={(q) => (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }))}
              onPick={(n) => { rows = [...rows, { key: createId("gm"), exerciseName: n, exerciseId: index?.get(n)?.id, amount: /plank|hold|hang|carry|sprint|bike|rower|\brun\b/i.test(n) ? "0:30" : "10" }]; }}
              onCancel={() => (adding = false)} />
          </div>
        {:else}
          <Button variant="outline" size="sm" class="mt-2 h-9 self-start" onclick={() => (adding = true)}>+ Exercise</Button>
        {/if}
        {#if draft.members.some((m) => m.blockId && !rows.some((r) => r.blockId === m.blockId))}
          <p class="mt-1.5 text-xs text-muted-foreground">Ones you take out stay on the day on their own.</p>
        {/if}
      </div>

      <div class="flex flex-col gap-1.5">
        <Label>How it moves up</Label>
        <RadioGroup.Root value={progression} onValueChange={(v) => (progression = v as typeof progression)} class="flex flex-col gap-1.5">
          {#each MOVES as m (m.value)}
            <label class="flex items-start gap-2 text-[13px]"><RadioGroup.Item value={m.value} aria-label={m.label} class="mt-0.5" /><span>{m.label}{#if m.sub && progression === m.value}<span class="block text-xs text-muted-foreground">{m.sub}</span>{/if}</span></label>
          {/each}
        </RadioGroup.Root>
      </div>
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={save}>Save {kind}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
