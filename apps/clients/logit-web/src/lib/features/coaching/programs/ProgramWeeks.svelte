<!-- Every week (canvas PG3): what the rule plans for each exercise, week by week. Click a cell
     to type over it (it stays put, with a blue edge); Clear gives it back to the rule. Copy,
     paste, and fill to the end of the block (up to the next lighter week). On your program the
     rule is said in words until you pick a client to preview it with their lifts. -->
<script lang="ts">
  import { onMount } from "svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import { getWebDeps } from "$lib/deps";
  import { getProgramProgress, getProgramStartMs, type CoachProgram, type ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { cellText, parseCell, pinWeek, planExercise, unpinWeek, type PlanCell } from "@logit/core/domain/programPlan";
  import { bestWorkingSet } from "@logit/core/domain/sessionHistory";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import type { StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";

  let { program, mode, clientId = null, preview = [], edit }: {
    program: CoachProgram;
    mode: "library" | "copy";
    /** Copy mode: whose copy (their lifts and what they've done). */
    clientId?: string | null;
    /** Library: clients with a copy, to preview the plan with their lifts. */
    preview?: { clientId: string; label: string }[];
    edit: (fn: (p: CoachProgram) => CoachProgram) => void;
  } = $props();

  const DAY = 86_400_000;
  const weeks = $derived([...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber));
  const template = $derived(weeks[0]!);
  const days = $derived([...template.days].sort((a, b) => a.orderIndex - b.orderIndex));
  let dayId = $state<string>("");
  const day = $derived(days.find((d) => d.id === dayId) ?? days[0] ?? null);
  const rows = $derived(day ? [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : []);

  // Whose lifts: their copy, or a client picked to preview with.
  // svelte-ignore state_referenced_locally
  let showing = $state<string>(clientId ?? "");
  let sessions = $state<WorkoutSession[]>([]);
  $effect(() => {
    const who = mode === "copy" ? clientId : showing;
    sessions = [];
    if (!who) return;
    void getWebDeps(who).workoutRepo.listAllSessions().then((s) => (sessions = s.filter((x) => x.endedAtMs != null)), () => {});
  });

  /** Their best estimate per exercise over the last 12 weeks. */
  const estimates = $derived.by(() => {
    const since = Date.now() - 84 * DAY;
    const m = new Map<string, number>();
    for (const s of sessions) {
      if (s.startedAtMs < since) continue;
      for (const b of s.blocks) {
        if (b.type !== "strength") continue;
        const d = b.data as StrengthBlockData;
        const best = bestWorkingSet(d.sets);
        if (!best || best.weight <= 0) continue;
        const key = d.exerciseName.trim().toLowerCase();
        m.set(key, Math.max(m.get(key) ?? 0, estimated1RM(best.weight, best.reps)));
      }
    }
    return m;
  });

  const start = $derived(mode === "copy" ? getProgramStartMs(program) : null);
  const nowWeek = $derived.by(() => {
    if (mode !== "copy") return null;
    const p = getProgramProgress(program);
    return p.status === "running" ? p.weekNumber : null;
  });

  function done(weekNumber: number, block: ProgramStrength) {
    if (start == null) return null;
    const from = start + (weekNumber - 1) * 7 * DAY;
    let best: { weight: number; reps: number } | null = null;
    for (const s of sessions) {
      if (s.startedAtMs < from || s.startedAtMs >= from + 7 * DAY || s.source?.kind !== "program" || s.source.parentId !== program.id) continue;
      for (const b of s.blocks) {
        if (b.type !== "strength") continue;
        const d = b.data as StrengthBlockData;
        if (d.exerciseName.trim().toLowerCase() !== block.exerciseName.trim().toLowerCase()) continue;
        const set = bestWorkingSet(d.sets);
        if (set && (!best || estimated1RM(set.weight, set.reps) > estimated1RM(best.weight, best.reps))) best = set;
      }
    }
    return best;
  }

  const ctx = $derived({
    e1rm: (name: string) => estimates.get(name.trim().toLowerCase()) ?? null,
    done: mode === "copy" ? done : undefined,
  });
  const plans = $derived(new Map(rows.filter((b) => b.type === "strength").map((b) => [b.id, planExercise(program, b.id, ctx)])));

  // ── Cells ──
  let selected = $state<{ blockId: string; week: number } | null>(null);
  let editing = $state<{ blockId: string; week: number } | null>(null);
  let draft = $state("");
  let clipboard = $state<string | null>(null);

  const usual = (b: ProgramStrength) => b.sets.filter((s) => s.setType !== "warmup").length;
  const textOf = (b: ProgramStrength, week: number): string => {
    const c = plans.get(b.id)?.[week - 1];
    return c ? cellText(c, usual(b)) : "";
  };

  function commit(blockId: string, week: number, text: string): boolean {
    const v = parseCell(text);
    if (!v) { toast.error("Type it like 62.5 × 7, or just the reps"); return false; }
    // Week 1 is the built week: the rule starts from it, so it isn't pinned.
    if (week === template.weekNumber) {
      edit((p) => ({ ...p, weeks: p.weeks.map((w) => (w.weekNumber !== week ? w : { ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id !== blockId || b.type !== "strength" ? b : { ...b, sets: b.sets.map((s) => { if (s.setType === "warmup") return s; const { reps: _r, repsMin: _a, repsMax: _b, percent1RM: _p, ...rest } = s; return { ...rest, ...v }; }) })) })) })) }));
    } else edit((p) => pinWeek(p, week, blockId, v));
    return true;
  }

  /** The weeks after this one, up to the next lighter week. */
  function restOfBlock(week: number): number[] {
    const out: number[] = [];
    for (const w of weeks) {
      if (w.weekNumber <= week) continue;
      if (w.lighter) break;
      out.push(w.weekNumber);
    }
    return out;
  }

  function cellActions(b: ProgramStrength, week: number, cell: PlanCell | null): RowAction[] {
    const t = textOf(b, week);
    return [
      { id: "type", label: "Type over…", run: () => startEdit(b.id, week) },
      { id: "clear", label: "Clear (back to the rule)", run: () => edit((p) => unpinWeek(p, week, b.id)), disabled: cell?.source !== "pinned" ? "Not typed over" : undefined },
      { id: "copy", label: "Copy", run: () => { clipboard = t; toast.message(`Copied ${t}`); }, separatorBefore: true, disabled: cell?.source === "words" ? "No numbers to copy" : undefined },
      { id: "paste", label: clipboard ? `Paste ${clipboard}` : "Paste", run: () => { if (clipboard) commit(b.id, week, clipboard.split(" · ")[0]!); }, disabled: clipboard ? undefined : "Nothing copied" },
      {
        id: "fill", label: "Fill to the end of the block", separatorBefore: true,
        run: () => { const v = parseCell(t.split(" · ")[0] ?? ""); if (!v) return; const ws = restOfBlock(week); edit((p) => ws.reduce((acc, n) => pinWeek(acc, n, b.id, v), p)); toast.message(`Filled weeks ${ws.join(", ")}`); },
        disabled: !parseCell(t.split(" · ")[0] ?? "") ? "No numbers to fill" : restOfBlock(week).length ? undefined : "Nothing after it in this block",
      },
    ];
  }

  function startEdit(blockId: string, week: number) {
    const b = rows.find((x) => x.id === blockId);
    selected = { blockId, week };
    editing = { blockId, week };
    draft = b?.type === "strength" ? textOf(b, week).split(" · ")[0]! : "";
  }

  function onKey(e: KeyboardEvent, b: ProgramStrength, week: number) {
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(b.id, week); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { clipboard = textOf(b, week); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) { e.preventDefault(); commit(b.id, week, clipboard.split(" · ")[0]!); }
    else if (e.key === "Delete" || e.key === "Backspace") { if (plans.get(b.id)?.[week - 1]?.source === "pinned") edit((p) => unpinWeek(p, week, b.id)); }
  }

  onMount(() => { dayId = days[0]?.id ?? ""; });

  const cellClass = (c: PlanCell | null) =>
    !c ? "text-muted-foreground"
      : c.source === "done" ? "text-muted-foreground"
      : c.source === "pinned" ? "font-semibold ring-2 ring-info/60 ring-inset"
      : c.source === "rule" ? "text-info"
      : "text-xs text-muted-foreground";
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    {#if days.length > 1}
      <Tabs.Root bind:value={dayId}>
        <Tabs.List variant="line" aria-label="Day">
          {#each days as d, i (d.id)}<Tabs.Trigger value={d.id}>{d.name ?? `Day ${i + 1}`}</Tabs.Trigger>{/each}
        </Tabs.List>
      </Tabs.Root>
    {:else}<span></span>{/if}
    {#if mode === "library"}
      <label class="flex items-center gap-2 text-[13px]">
        <span class="text-muted-foreground">Showing</span>
        <OptionSelect size="sm" bind:value={showing} aria-label="Showing" class="w-56"
          options={[{ value: "", label: "The rule, in words" }, ...preview.map((c) => ({ value: c.clientId, label: `With ${c.label}'s lifts` }))]} />
      </label>
    {:else}
      <span class="text-xs text-muted-foreground">Their copy{nowWeek ? ` · week ${nowWeek} of ${weeks.length} now` : ""} · numbers from their strength estimates</span>
    {/if}
  </div>

  <div class="overflow-x-auto rounded-[10px] border border-border">
    <table class="w-full min-w-[720px] border-collapse text-[13px]">
      <thead>
        <tr class="text-left text-xs text-muted-foreground">
          <th class="sticky left-0 bg-card px-3 py-2 font-medium">Exercise · sets</th>
          {#each weeks as w (w.id)}
            <th class="px-2 py-2 font-medium {w.weekNumber === nowWeek ? 'text-foreground' : ''}">
              Wk {w.weekNumber}
              {#if nowWeek != null && w.weekNumber < nowWeek}<span class="block text-[10px] font-normal">done</span>
              {:else if w.weekNumber === nowWeek}<span class="block text-[10px] font-semibold text-primary">now</span>
              {:else if w.lighter}<span class="block text-[10px] font-normal">lighter</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as b (b.id)}
          <tr class="border-t border-border">
            <th scope="row" class="sticky left-0 bg-card px-3 py-2 text-left font-normal">
              <span class="block font-medium">{b.type === "strength" ? b.exerciseName : b.type === "cardio" ? b.activityName : b.type === "mobility" ? b.drillName : b.type === "plugin" ? b.name : "Circuit"}</span>
              {#if b.type === "strength"}<span class="text-xs text-muted-foreground">{usual(b)} sets · {(b.rule ?? program.rule)?.kind === "adaptive" ? "Adaptive" : (b.rule ?? program.rule)?.kind === "linear" ? "Linear" : (b.rule ?? program.rule)?.kind === "wave" ? "Wave" : "Fixed"}</span>{/if}
            </th>
            {#each weeks as w (w.id)}
              {#if b.type === "strength"}
                {@const c = plans.get(b.id)?.[w.weekNumber - 1] ?? null}
                {@const isEditing = editing?.blockId === b.id && editing.week === w.weekNumber}
                <td class="p-0.5">
                  {#if isEditing}
                    <input aria-label="{b.exerciseName}, week {w.weekNumber}" bind:value={draft}
                      class="h-9 w-full min-w-24 rounded-[6px] border border-info bg-background px-2 text-[13px]"
                      onkeydown={(e) => { if (e.key === "Enter") { if (commit(b.id, w.weekNumber, draft)) editing = null; } else if (e.key === "Escape") editing = null; }}
                      onblur={() => { if (editing && draft.trim() && draft.trim() !== textOf(b, w.weekNumber).split(" · ")[0]) commit(b.id, w.weekNumber, draft); editing = null; }}
                      {@attach (el) => el.focus()} />
                  {:else}
                    <ActionMenu actions={cellActions(b, w.weekNumber, c)} label="{b.exerciseName}, week {w.weekNumber}">
                      {#snippet children({ props })}
                        <button type="button" {...props}
                          aria-label="{b.exerciseName}, week {w.weekNumber}: {c ? cellText(c, usual(b)) : 'none'}{c?.source === 'pinned' ? ', typed by you' : c?.source === 'done' ? ', done' : ''}"
                          onclick={() => (selected = { blockId: b.id, week: w.weekNumber })}
                          ondblclick={() => startEdit(b.id, w.weekNumber)}
                          onkeydown={(e) => onKey(e, b, w.weekNumber)}
                          class="flex h-9 w-full min-w-24 items-center whitespace-nowrap rounded-[6px] px-2 text-left tabular-nums hover:bg-muted {cellClass(c)} {selected?.blockId === b.id && selected.week === w.weekNumber ? 'bg-muted outline outline-1 outline-border' : ''} {w.lighter ? 'bg-muted/40' : ''}">
                          {c ? cellText(c, usual(b)) : "–"}{#if c?.source === "done"}<span class="ml-1 text-[10px]">done</span>{/if}
                        </button>
                      {/snippet}
                    </ActionMenu>
                  {/if}
                </td>
              {:else}
                <td class="px-2 py-2 text-xs text-muted-foreground">{w.weekNumber === 1 ? "Same each week" : ""}</td>
              {/if}
            {/each}
          </tr>
        {:else}
          <tr><td colspan={weeks.length + 1} class="px-3 py-6 text-center text-muted-foreground">No exercises on this day yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
    {#if mode === "copy"}<span>Grey: done</span>{/if}
    <span><span class="text-info">Blue</span>: planned by the rule; it moves if they beat or miss it</span>
    <span><span class="rounded-[3px] px-1 font-semibold ring-2 ring-info/60 ring-inset">Blue edge</span>: typed by you; stays put</span>
    <span>Double-click or Enter to type over a cell; ⋯ or right-click to copy, paste, clear or fill to the end of the block.</span>
  </p>
</div>
