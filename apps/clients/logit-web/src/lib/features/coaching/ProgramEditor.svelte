<script lang="ts">
  import { blockLine } from "@logit/core/domain/CoachProgram";
  import * as Table from "$lib/components/ui/table/index.js";
  import ConfirmDialog, { type Ask } from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { CoachProgram, ProgramDay, ProgramSet, ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { SET_TYPE_META, type SetType } from "@logit/core/domain/workout";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import type { SwapRule } from "@logit/core/domain/swaps";

  // The coach's program editor, for a library program and for a client's own copy.
  // Changes stay here until Save, so a half-built week never reaches a phone.

  let {
    program,
    mode,
    copies = [],
    swapRule,
    onSave,
  }: {
    program: CoachProgram;
    /** "library": a reusable program; "copy": one client's own copy (with its start). */
    mode: "library" | "copy";
    /** Library only: clients' copies of this program, offered for updating on save. */
    copies?: { id: string; label: string }[];
    /** The swap rule these clients have, for the hint under exercises without alternatives. */
    swapRule?: SwapRule;
    onSave: (next: CoachProgram, updateCopies: string[]) => Promise<void>;
  } = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state<CoachProgram>(structuredClone($state.snapshot(program)) as CoachProgram);
  // svelte-ignore state_referenced_locally
  let saved = $state(JSON.stringify(program));
  let weekId = $state<string>("");
  let openDay = $state<string | null>(null);
  let adding = $state<string | null>(null);
  let copyTo = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);
  let tick = $state<string[]>([]);
  let index = $state<ExerciseIndex | null>(null);
  let addingSwap = $state<string | null>(null);

  const weeks = $derived([...draft.weeks].sort((a, b) => a.weekNumber - b.weekNumber));
  const week = $derived(weeks.find((w) => w.id === weekId) ?? weeks[0]);
  const days = $derived(week ? [...week.days].sort((a, b) => a.orderIndex - b.orderIndex) : []);
  const dirty = $derived(JSON.stringify(draft) !== saved);

  onMount(async () => {
    weekId = weeks[0]?.id ?? "";
    openDay = days[0]?.id ?? null;
    index = await loadExerciseIndex([]).catch(() => null);
  });

  let ask = $state<Ask | null>(null);
  let leaving = false;
  beforeNavigate((nav) => {
    if (leaving || !dirty || saving) return;
    nav.cancel(); // closing the tab ('leave') gets the browser's own prompt from this
    const to = nav.to?.url;
    if (nav.type === "leave" || !to) return;
    ask = { title: "Leave without saving?", text: "Your changes to this program will be lost.", action: "Leave", run: () => { leaving = true; void goto(to); } };
  });

  function edit(fn: (p: CoachProgram) => CoachProgram) {
    draft = fn($state.snapshot(draft) as CoachProgram);
  }

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const setTypes = SET_TYPE_META.filter((m) => m.type !== "amrap");

  function searchExercises(q: string) {
    return (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }));
  }

  function addExercise(day: ProgramDay, name: string) {
    if (!week) return;
    const id = index?.get(name)?.id;
    edit((p) => {
      let next = P.addStrengthBlock(p, week.id, day.id, { exerciseName: name, exerciseId: id });
      const nd = next.weeks.find((w) => w.id === week.id)!.days.find((d) => d.id === day.id)!;
      const block = nd.blocks.at(-1)!;
      for (let i = 0; i < 3; i++) next = P.addSet(next, week.id, day.id, block.id, { reps: 8, restSec: 120 });
      return next;
    });
    adding = null;
  }

  function setField(day: ProgramDay, block: ProgramStrength, set: ProgramSet, field: "reps" | "load" | "rpe" | "rest" | "tempo", text: string, el: HTMLInputElement) {
    if (!week) return;
    let patch: Partial<ProgramSet> | null = null;
    if (field === "reps") patch = P.parseRepsText(text, set.setType);
    else if (field === "load") patch = P.parseLoadText(text);
    else if (field === "rpe") {
      const n = text.trim() === "" ? undefined : Number(text.replace(",", "."));
      patch = n === undefined || (Number.isFinite(n) && n >= 1 && n <= 10) ? { rpe: n } : null;
    } else if (field === "rest") {
      const r = P.parseRestText(text);
      patch = r === null ? null : { restSec: r };
    } else patch = { tempo: text.trim() || undefined };
    if (!patch) {
      el.setCustomValidity(field === "reps" ? "Use 8, 8-10 or AMRAP" : field === "load" ? "Use kilos (60) or a percent (72%)" : field === "rest" ? "Use 2:30 or 90" : "RPE is 1 to 10");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    edit((p) => P.updateSet(p, week.id, day.id, block.id, set.id, patch!));
  }

  // ── Approved swaps (they apply to the exercise in every week of the program) ──

  const exRef = (b: ProgramStrength) => ({ exerciseName: b.exerciseName, exerciseId: b.exerciseId });

  function addSwap(block: ProgramStrength, name: string) {
    const id = index?.get(name)?.id;
    edit((p) => P.addAlternative(p, exRef(block), { exerciseName: name, exerciseId: id }));
  }

  function removeSwap(block: ProgramStrength, name: string) {
    edit((p) => P.removeAlternative(p, exRef(block), name));
  }

  /** Up to six exercises for the same main muscle, not already listed. */
  function sameMuscleSuggestions(block: ProgramStrength): string[] {
    const main = index?.get(block.exerciseName)?.primaryMuscles[0];
    if (!main || !index) return [];
    const taken = new Set([block.exerciseName, ...(block.alternatives ?? []).map((a) => a.exerciseName)].map((n) => n.toLowerCase()));
    return index.list
      .filter((e) => e.primaryMuscles.includes(main) && !taken.has(e.name.toLowerCase()))
      .sort((a, b) => Number(b.primaryMuscles[0] === main) - Number(a.primaryMuscles[0] === main) || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((e) => e.name);
  }

  function searchSwaps(block: ProgramStrength) {
    return (q: string) => searchExercises(q).filter((r) => r.name.toLowerCase() !== block.exerciseName.toLowerCase());
  }

  const NO_SWAPS_HINT: Record<SwapRule, string> = {
    any: "none yet, so any exercise",
    muscles: "none yet, so same-muscle exercises",
    list: "none yet, so it can't be swapped",
  };

  /** A new set with the same targets as the last one. */
  function addSetLike(day: ProgramDay, block: ProgramStrength) {
    if (!week) return;
    const last = block.sets.at(-1);
    let like: Partial<ProgramSet> = { reps: 8 };
    if (last) {
      const { id: _id, orderIndex: _order, ...rest } = $state.snapshot(last) as ProgramSet;
      like = rest;
    }
    edit((p) => P.addSet(p, week.id, day.id, block.id, like));
  }

  function copyWeek() {
    if (!week || !copyTo) return;
    const target = copyTo;
    if (target === "__new") edit((p) => P.duplicateWeek(p, week.id));
    else edit((p) => P.copyWeekOver(p, week.id, target));
    copyTo = "";
  }

  function addWeek() {
    edit((p) => P.addWeek(p));
    weekId = draft.weeks.at(-1)!.id;
  }

  function removeWeek() {
    if (!week || draft.weeks.length <= 1) return;
    const id = week.id;
    const remove = () => { edit((p) => P.removeWeek(p, id)); weekId = draft.weeks[0]?.id ?? ""; };
    if (!week.days.length) return remove();
    ask = { title: `Remove week ${week.weekNumber} and its days?`, action: "Remove week", run: remove };
  }

  function addDay() {
    if (!week) return;
    edit((p) => P.addDay(p, week.id, `Day ${week.days.length + 1}`));
    openDay = draft.weeks.find((w) => w.id === week.id)!.days.at(-1)!.id;
  }

  async function save() {
    saving = true;
    error = null;
    try {
      const next = P.touchCoachProgram($state.snapshot(draft) as CoachProgram);
      await onSave(next, tick);
      guideSignal("program.saved");
      draft = next;
      saved = JSON.stringify(next);
      tick = [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      saving = false;
    }
  }

  function discard() {
    draft = JSON.parse(saved);
    if (!draft.weeks.some((w) => w.id === weekId)) weekId = draft.weeks[0]?.id ?? "";
  }

  function blockSummary(d: ProgramDay): string {
    const n = d.blocks.length;
    return `${n} exercise${n === 1 ? "" : "s"}${d.weekday != null ? ` · ${WEEKDAYS[d.weekday]}` : ""}`;
  }

  const input = "h-8 rounded-[7px] border border-input bg-background px-2 text-[13px]";
</script>

<div class="flex flex-col gap-3.5" data-guide="program-editor">
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex flex-[2_1_220px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
      <input value={draft.name} oninput={(e) => (draft.name = e.currentTarget.value)} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[15px] font-semibold text-foreground" />
    </label>
    <span class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Weeks
      <span class="flex h-9 items-center gap-1.5 text-[13px] text-foreground">{draft.weeks.length}
        <button type="button" onclick={addWeek} class="h-8 rounded-[7px] border border-border px-2 text-xs hover:bg-muted">+ Week</button>
      </span>
    </span>
  </div>
  <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Description (clients see this)
    <input value={draft.description ?? ""} oninput={(e) => (draft.description = e.currentTarget.value || undefined)} placeholder="Upper / lower, 4 days. Add a rep each week." class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
  </label>

  {#if mode === "copy"}
    <div class="flex flex-wrap items-center gap-2 text-[13px]">
      <label for="start-mode" class="text-muted-foreground">Starts</label>
      <OptionSelect size="sm" id="start-mode" value={draft.startMode === "fixed-date" ? "fixed-date" : "manual"}
        onValueChange={(m) => edit((p) => m === "fixed-date" ? P.setProgramStart(p, { mode: "fixed-date", startDateMs: p.startDateMs ?? P.startOfLocalDayMs() }) : P.setProgramStart(p, { mode: "manual" }))}
        options={[{ value: "manual", label: "When they tap Start" }, { value: "fixed-date", label: "On a date" }]} />
      {#if draft.startMode === "fixed-date"}
        <DateField aria-label="Start date" class="h-8 w-auto text-[13px]"
          bind:value={() => (draft.startDateMs != null ? P.toDateInputValue(draft.startDateMs) : undefined), (v) => { const ms = v ? P.fromDateInputValue(v) : null; if (ms != null) edit((p) => P.setProgramStart(p, { mode: "fixed-date", startDateMs: ms })); }} />
      {:else if draft.clientStartedAtMs}
        <span class="text-xs text-muted-foreground">They started on {new Date(draft.clientStartedAtMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      {/if}
    </div>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-2">
    <div role="tablist" aria-label="Week" class="flex flex-wrap gap-1">
      {#each weeks as w (w.id)}
        <button type="button" role="tab" aria-selected={w.id === week?.id} onclick={() => (weekId = w.id)}
          class="h-[30px] rounded-lg px-3 text-xs {w.id === week?.id ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}">{w.id === week?.id ? `Week ${w.weekNumber}` : w.weekNumber}{w.name ? ` · ${w.name}` : ""}</button>
      {/each}
    </div>
    <span class="flex flex-wrap items-center gap-2">
      <label for="copy-week" class="sr-only">Copy this week to</label>
      <OptionSelect size="sm" id="copy-week" bind:value={copyTo} onValueChange={copyWeek}
        options={[{ value: "", label: `Copy week ${week?.weekNumber} to…` }, ...weeks.filter((w) => w.id !== week?.id).map((w) => ({ value: w.id, label: `Week ${w.weekNumber} (replaces it)` })), { value: "__new", label: "A new week at the end" }]} />
      <button type="button" onclick={addDay} class="h-[30px] rounded-lg border border-border px-2.5 text-xs hover:bg-muted">+ Day</button>
      {#if weeks.length > 1}<button type="button" onclick={removeWeek} class="h-[30px] rounded-lg border border-border px-2.5 text-xs text-destructive hover:bg-muted">Remove week</button>{/if}
    </span>
  </div>

  {#if week}
    <label class="flex items-center gap-2 text-xs text-muted-foreground">Week {week.weekNumber} label
      <input value={week.name ?? ""} placeholder="e.g. deload" class="{input} w-40"
        oninput={(e) => { const v = e.currentTarget.value; const id = week.id; draft.weeks = draft.weeks.map((w) => (w.id === id ? { ...w, name: v || undefined } : w)); }} />
    </label>
  {/if}

  {#each days as day, di (day.id)}
    {@const labels = P.supersetLabels(day)}
    {#if openDay === day.id && week}
      <div class="flex flex-col gap-1 rounded-[10px] bg-muted/60 px-3.5 py-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="dayname-{day.id}">Day name</label>
            <input id="dayname-{day.id}" value={day.name ?? `Day ${di + 1}`} class="h-8 w-44 rounded-[7px] border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-input focus:border-input"
              oninput={(e) => { const v = e.currentTarget.value; edit((p) => P.updateDay(p, week.id, day.id, { name: v })); }} />
            <label class="sr-only" for="weekday-{day.id}">Weekday</label>
            <OptionSelect size="sm" id="weekday-{day.id}" value={day.weekday == null ? "" : String(day.weekday)}
              onValueChange={(v) => edit((p) => P.updateDay(p, week.id, day.id, { weekday: v === "" ? undefined : Number(v) }))}
              options={[{ value: "", label: "Any day" }, ...WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))]} />
          </span>
          <span class="flex gap-3">
            <button type="button" class="text-xs text-destructive hover:underline" onclick={() => { const remove = () => edit((p) => P.removeDay(p, week.id, day.id)); if (!day.blocks.length) remove(); else ask = { title: `Remove ${day.name ?? "this day"}?`, action: "Remove day", run: remove }; }}>Remove day</button>
            <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (openDay = null)}>Close</button>
          </span>
        </div>
        <div class="overflow-x-auto">
          <Table.Root class="w-full min-w-[640px] border-collapse text-[13px]">
            <Table.Header><Table.Row class="text-left text-[11px] text-muted-foreground"><Table.Head class="w-[30%] px-2 py-1.5 font-medium">Exercise / set</Table.Head><Table.Head class="px-2 py-1.5 font-medium">Reps</Table.Head><Table.Head class="px-2 py-1.5 font-medium">Load</Table.Head><Table.Head class="px-2 py-1.5 font-medium">RPE</Table.Head><Table.Head class="px-2 py-1.5 font-medium">Rest</Table.Head><Table.Head class="px-2 py-1.5 font-medium">Tempo</Table.Head><Table.Head class="px-2 py-1.5 font-medium">Type</Table.Head><Table.Head></Table.Head></Table.Row></Table.Header>
            <Table.Body>
              {#each [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) as block, bi (block.id)}
                <Table.Row class="border-t border-border">
                  <Table.Cell colspan={8} class="px-2 pb-1 pt-3">
                    <span class="flex flex-wrap items-center gap-2">
                      {#if labels.get(block.id)}<span class="rounded-[5px] bg-muted-foreground px-1.5 text-[11px] font-bold text-background">{labels.get(block.id)}</span>{/if}
                      <span class="font-semibold">{blockLine(block)}</span>
                      <span class="ml-auto flex flex-wrap gap-2.5 text-[11px] text-muted-foreground">
                        {#if bi > 0}<button type="button" class="hover:text-foreground" aria-label="Move up" onclick={() => edit((p) => P.moveBlock(p, week.id, day.id, block.id, -1))}>↑</button>{/if}
                        {#if bi < day.blocks.length - 1}<button type="button" class="hover:text-foreground" aria-label="Move down" onclick={() => edit((p) => P.moveBlock(p, week.id, day.id, block.id, 1))}>↓</button>{/if}
                        {#if labels.get(block.id)}
                          <button type="button" class="hover:text-foreground" onclick={() => edit((p) => P.leaveSuperset(p, week.id, day.id, block.id))}>Unpair</button>
                        {:else if bi > 0}
                          <button type="button" class="hover:text-foreground" onclick={() => edit((p) => P.supersetWithPrevious(p, week.id, day.id, block.id))}>Superset with above</button>
                        {/if}
                        <button type="button" class="hover:text-destructive" onclick={() => edit((p) => P.removeBlock(p, week.id, day.id, block.id))}>Remove</button>
                      </span>
                    </span>
                    <label class="sr-only" for="note-{block.id}">Note for {blockLine(block)}</label>
                    <input id="note-{block.id}" value={block.note ?? ""} placeholder="Note for the client (optional)" class="mt-1 h-7 w-full rounded-[7px] border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-input focus:border-input"
                      oninput={(e) => { const v = e.currentTarget.value; edit((p) => P.updateBlock(p, week.id, day.id, block.id, { note: v || undefined })); }} />
                    {#if block.type === "strength"}
                      <div class="mt-1 flex flex-wrap items-center gap-1.5 px-1">
                        <span class="mr-0.5 text-xs text-muted-foreground">Swaps:</span>
                        {#each block.alternatives ?? [] as alt (alt.exerciseName)}
                          <span class="inline-flex h-[26px] items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{alt.exerciseName}<button type="button" aria-label="Remove {alt.exerciseName}" class="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" onclick={() => removeSwap(block, alt.exerciseName)}>✕</button></span>
                        {:else}
                          {#if swapRule}<span class="text-xs text-muted-foreground">{NO_SWAPS_HINT[swapRule]}</span>{/if}
                        {/each}
                        {#if addingSwap !== block.id}
                          <button type="button" class="h-[26px] rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:text-foreground" onclick={() => (addingSwap = block.id)}>+ Add</button>
                        {/if}
                      </div>
                      {#if addingSwap === block.id}
                        {@const suggestions = sameMuscleSuggestions(block)}
                        <div class="mt-1.5 flex max-w-sm flex-col gap-1.5 rounded-[9px] border border-border bg-background px-3 py-2.5">
                          <NamePicker id="swap-{block.id}" label="Add a swap for {block.exerciseName}" placeholder="Add a swap for {block.exerciseName}" search={searchSwaps(block)} autofocus onPick={(n) => addSwap(block, n)} onCancel={() => (addingSwap = null)} />
                          {#if suggestions.length}
                            <span class="text-xs text-muted-foreground">Same muscles as {block.exerciseName}:</span>
                            <span class="flex flex-wrap gap-1.5">
                              {#each suggestions as n (n)}<button type="button" class="h-[26px] rounded-full border border-border px-2.5 text-xs hover:bg-muted" onclick={() => addSwap(block, n)}>+ {n}</button>{/each}
                            </span>
                          {/if}
                          <span class="flex justify-between gap-2 text-xs text-muted-foreground">Applies to {block.exerciseName} in every week.<button type="button" class="hover:text-foreground" onclick={() => (addingSwap = null)}>Done</button></span>
                        </div>
                      {/if}
                    {/if}
                  </Table.Cell>
                </Table.Row>
                {#if block.type === "strength"}
                  {#each block.sets as set, si (set.id)}
                    <Table.Row>
                      <Table.Cell class="px-2 py-1 text-muted-foreground">Set {si + 1}</Table.Cell>
                      <Table.Cell class="px-2 py-1"><input aria-label="Reps, set {si + 1}" class="{input} w-[72px]" value={P.repsText(set)} onchange={(e) => setField(day, block, set, "reps", e.currentTarget.value, e.currentTarget)} /></Table.Cell>
                      <Table.Cell class="px-2 py-1"><input aria-label="Load, set {si + 1}" class="{input} w-[76px]" value={P.loadText(set)} placeholder="–" onchange={(e) => setField(day, block, set, "load", e.currentTarget.value, e.currentTarget)} /></Table.Cell>
                      <Table.Cell class="px-2 py-1"><input aria-label="RPE, set {si + 1}" class="{input} w-[52px]" value={set.rpe ?? ""} onchange={(e) => setField(day, block, set, "rpe", e.currentTarget.value, e.currentTarget)} /></Table.Cell>
                      <Table.Cell class="px-2 py-1"><input aria-label="Rest, set {si + 1}" class="{input} w-[64px]" value={P.restText(set.restSec)} onchange={(e) => setField(day, block, set, "rest", e.currentTarget.value, e.currentTarget)} /></Table.Cell>
                      <Table.Cell class="px-2 py-1"><input aria-label="Tempo, set {si + 1}" class="{input} w-[80px]" value={set.tempo ?? ""} onchange={(e) => setField(day, block, set, "tempo", e.currentTarget.value, e.currentTarget)} /></Table.Cell>
                      <Table.Cell class="px-2 py-1">
                        {#if set.setType === "amrap"}<span class="text-xs text-muted-foreground">AMRAP</span>{:else}
                          <OptionSelect size="sm" aria-label="Set type, set {si + 1}" value={set.setType}
                            onValueChange={(v) => edit((p) => P.updateSet(p, week.id, day.id, block.id, set.id, { setType: v as SetType }))}
                            options={setTypes.map((t) => ({ value: t.type, label: t.label }))} />
                        {/if}
                      </Table.Cell>
                      <Table.Cell class="px-2 py-1"><button type="button" aria-label="Remove set {si + 1}" class="text-muted-foreground hover:text-destructive" onclick={() => edit((p) => P.removeSet(p, week.id, day.id, block.id, set.id))}>✕</button></Table.Cell>
                    </Table.Row>
                  {/each}
                  <Table.Row><Table.Cell colspan={8} class="px-2 pb-1"><button type="button" class="text-xs text-muted-foreground hover:text-foreground"
                    onclick={() => addSetLike(day, block)}>+ Set</button></Table.Cell></Table.Row>
                {/if}
              {:else}
                <Table.Row><Table.Cell colspan={8} class="px-2 py-3 text-xs text-muted-foreground">No exercises yet.</Table.Cell></Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
        {#if adding === day.id}
          <div class="max-w-sm pt-1">
            <NamePicker id="add-{day.id}" label="Add an exercise" placeholder="Search exercises" search={searchExercises} autofocus onPick={(n) => addExercise(day, n)} onCancel={() => (adding = null)} />
          </div>
        {:else}
          <div class="pt-1"><button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (adding = day.id)}>+ Exercise</button></div>
        {/if}
      </div>
    {/if}
  {/each}

  <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
    {#each days.filter((d) => d.id !== openDay) as day (day.id)}
      <button type="button" onclick={() => (openDay = day.id)} class="rounded-[10px] bg-muted/60 px-3.5 py-3 text-left hover:bg-muted">
        <span class="block text-[13px] font-semibold">{day.name ?? "Day"}</span>
        <span class="text-xs text-muted-foreground">{blockSummary(day)}</span>
      </button>
    {/each}
  </div>
  {#if days.length === 0}<p class="text-[13px] text-muted-foreground">Week {week?.weekNumber} has no days yet. <button type="button" class="text-primary hover:underline" onclick={addDay}>Add one</button>.</p>{/if}
  <p class="text-xs text-muted-foreground">Reps: 8, 8-10 or AMRAP. Load: kilos (60), a percent of their best (72%), or blank and use RPE. Rest: 2:30 or 90.</p>

  {#if dirty || error}
    <div class="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-background px-3.5 py-3 shadow-lg">
      <div class="flex flex-wrap items-center gap-3.5">
        <span class="text-[13px] font-semibold">{error ?? "Unsaved changes"}</span>
        {#if mode === "library" && copies.length}
          <span class="text-xs text-muted-foreground">Also update:</span>
          {#each copies as c (c.id)}
            <label class="flex items-center gap-1.5 text-[13px]"><Checkbox checked={tick.includes(c.id)} onCheckedChange={(v) => (tick = v ? [...tick, c.id] : tick.filter((x) => x !== c.id))} /> {c.label}</label>
          {/each}
        {/if}
      </div>
      <span class="flex gap-2">
        <button type="button" disabled={saving} onclick={discard} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px] hover:bg-muted">Discard</button>
        <button type="button" data-guide="program-save" disabled={saving || !dirty} onclick={save} class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </span>
    </div>
    {#if mode === "library" && copies.length}<p class="-mt-1 text-xs text-muted-foreground">Updating a copy keeps that client's start date and the week they're on. Unticked copies stay as they are.</p>{/if}
    {#if mode === "copy"}<p class="-mt-1 text-xs text-muted-foreground">Only this client's copy changes. It reaches their phone on its next sync.</p>{/if}
  {/if}
</div>

<ConfirmDialog bind:ask />
