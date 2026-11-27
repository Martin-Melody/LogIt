<!-- The program builder (canvas PG2, Z6): one week of days that applies to every week, a rule
     for every exercise, exercise rows with an inspector beside them. No Save button: every
     change saves as you go, Ctrl Z undoes, and a change saved on another device meanwhile is
     merged in (asking only when both changed the same thing). -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import * as Dialog from "$lib/components/ui/dialog";
  import { TimeField } from "$lib/components/ui/time-field/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import Undo2Icon from "@lucide/svelte/icons/undo-2";
  import Redo2Icon from "@lucide/svelte/icons/redo-2";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import ProgramWeeks from "./ProgramWeeks.svelte";
  import RulePickerDialog from "./RulePickerDialog.svelte";
  import CircuitDialog from "./CircuitDialog.svelte";
  import PluginBlockDialog from "./PluginBlockDialog.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { guideSignal } from "$lib/features/guide/signal";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import * as P from "@logit/core/domain/CoachProgram";
  import type { CoachProgram, ProgramBlock, ProgramDay, ProgramRule, ProgramSet, ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { applyTemplate, copyOwnChanges, forBuilder, libraryChanges, mergePrograms, setLength, setLighterWeeks, takeTheirs, templateOf, type MergeConflict } from "@logit/core/domain/programBuilder";
  import { BUILTIN_MOBILITY_DRILLS } from "@logit/core/domain/mobilityDrill";
  import { createId } from "@logit/core/domain/ids";
  import { SET_TYPE_META, type SetType } from "@logit/core/domain/workout";
  import type { SwapRule } from "@logit/core/domain/swaps";

  let {
    program,
    mode,
    username,
    copies = [],
    swapRule = "any",
    updateCopies,
    onchange,
    clientId = null,
    preview = [],
  }: {
    /** Already shaped for the builder (forBuilder). */
    program: CoachProgram;
    /** "library": one of your programs; "copy": a client's own copy. */
    mode: "library" | "copy";
    /** Copy mode: whose copy, for saving. */
    username?: string;
    /** Library: clients' copies, offered for updating (canvas Q6). */
    copies?: { id: string; label: string; program: CoachProgram }[];
    swapRule?: SwapRule;
    updateCopies?: (next: CoachProgram, ids: string[]) => Promise<void>;
    onchange?: (next: CoachProgram) => void;
    /** Copy mode: whose copy, for "Every week" (their lifts and what they've done). */
    clientId?: string | null;
    /** Library: clients with a copy, to preview "Every week" with their lifts. */
    preview?: { clientId: string; label: string }[];
  } = $props();

  /** Canvas PG3: the days, or every week. */
  let view = $state<"days" | "weeks">("days");

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const setTypes = SET_TYPE_META.filter((m) => m.type !== "amrap");

  // ── The program, history and saving ──
  // svelte-ignore state_referenced_locally
  let prog = $state<CoachProgram>(program);
  /** What the server last had from us (or we last loaded): the base for merging (Z6). */
  // svelte-ignore state_referenced_locally
  let base = $state<CoachProgram>(program);
  let past = $state<CoachProgram[]>([]);
  let future = $state<CoachProgram[]>([]);
  let status = $state<"saved" | "pending" | "saving" | "error">("saved");
  let savedAt = $state(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let conflicts = $state<MergeConflict[]>([]);
  let theirsForConflicts = $state<CoachProgram | null>(null);

  const t = $derived(templateOf(prog));
  const days = $derived([...t.days].sort((a, b) => a.orderIndex - b.orderIndex));
  let dayId = $state<string | null>(null);
  let blockId = $state<string | null>(null);
  const day = $derived(days.find((d) => d.id === dayId) ?? days[0] ?? null);
  const block = $derived(day?.blocks.find((b) => b.id === blockId) ?? null);
  const blocks = $derived(day ? [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : []);

  /** A change to the program; every week follows the built week. */
  function edit(fn: (p: CoachProgram, weekId: string) => CoachProgram) {
    const before = $state.snapshot(prog) as CoachProgram;
    const changed = fn(before, templateOf(before).id);
    const next = applyTemplate(changed, templateOf(changed));
    past = [...past.slice(-99), before];
    future = [];
    prog = next;
    schedule();
  }

  function undo() {
    const prev = past.at(-1);
    if (!prev) return;
    future = [$state.snapshot(prog) as CoachProgram, ...future];
    past = past.slice(0, -1);
    prog = prev;
    schedule();
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    past = [...past, $state.snapshot(prog) as CoachProgram];
    future = future.slice(1);
    prog = next;
    schedule();
  }

  function schedule() {
    status = "pending";
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 700);
  }

  /** Save now, merging in anything saved elsewhere since (canvas Z6). */
  async function flush() {
    clearTimeout(timer);
    if (status === "saving") return schedule();
    status = "saving";
    const repo = getWebCoachProgramRepo();
    try {
      const remote = await repo.getMyProgram(prog.id).catch(() => null);
      if (remote && remote.program.updatedAtMs > base.updatedAtMs) {
        const theirs = forBuilder(P.upgradeProgram(remote.program));
        if (theirs) merge(theirs);
      }
      const snap = $state.snapshot(prog) as CoachProgram;
      const toSave = P.touchCoachProgram(snap);
      await repo.saveProgram(toSave, mode === "copy" ? username : undefined);
      base = toSave;
      // Unchanged while saving: take the saved one (its time). Changed: the next save follows.
      if (JSON.stringify($state.snapshot(prog)) === JSON.stringify(snap)) prog = toSave;
      status = "saved";
      savedAt = Date.now();
      guideSignal("program.saved");
      onchange?.(toSave);
    } catch {
      status = "error";
      timer = setTimeout(() => void flush(), 5000);
    }
  }

  function merge(theirs: CoachProgram) {
    const r = mergePrograms(base, $state.snapshot(prog) as CoachProgram, theirs);
    prog = r.program;
    base = theirs;
    if (r.taken.length) toast.message(`Added a change from another device: ${r.taken.slice(0, 2).join(", ")}${r.taken.length > 2 ? ` and ${r.taken.length - 2} more` : ""}`, { action: { label: "Undo", onClick: undo } });
    if (r.conflicts.length) {
      conflicts = r.conflicts;
      theirsForConflicts = theirs;
    }
  }

  /** While nothing's waiting to save, look for changes from elsewhere now and then. */
  async function poll() {
    if (status !== "saved" || conflicts.length || document.hidden) return;
    const remote = await getWebCoachProgramRepo().getMyProgram(prog.id).catch(() => null);
    if (!remote || remote.program.updatedAtMs <= base.updatedAtMs) return;
    const theirs = forBuilder(P.upgradeProgram(remote.program));
    if (theirs) merge(theirs);
  }

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let index = $state<ExerciseIndex | null>(null);
  onMount(() => {
    dayId = days[0]?.id ?? null;
    void loadExerciseIndex([]).then((i) => (index = i), () => {});
    pollTimer = setInterval(() => void poll(), 20_000);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.closest("input, textarea, [contenteditable=true]"))) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (status === "pending" || status === "saving") e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload); };
  });
  onDestroy(() => { clearInterval(pollTimer); if (status === "pending") void flush(); });
  beforeNavigate(() => { if (status === "pending") void flush(); });

  function resolve(c: MergeConflict, useTheirs: boolean) {
    if (useTheirs && theirsForConflicts) {
      const before = $state.snapshot(prog) as CoachProgram;
      prog = takeTheirs(before, theirsForConflicts, c.key);
      schedule();
    }
    conflicts = conflicts.filter((x) => x.key !== c.key);
    if (!conflicts.length) theirsForConflicts = null;
  }

  const statusText = $derived(
    status === "saving" || status === "pending" ? "Saving…" : status === "error" ? "Couldn't save. Trying again…" : `Saved${Date.now() - savedAt < 60_000 ? "" : ` at ${new Date(savedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}`,
  );

  // ── Exercises ──
  function searchExercises(q: string) {
    return (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }));
  }
  const searchDrills = (q: string) => {
    const s = q.trim().toLowerCase();
    return s ? BUILTIN_MOBILITY_DRILLS.filter((d) => d.name.toLowerCase().includes(s)).slice(0, 8).map((d) => ({ name: d.name, detail: d.area })) : [];
  };
  const ACTIVITIES = ["Walk", "Incline walk", "Run", "Bike", "Rower", "Elliptical", "Stairs", "Swim", "Ski erg"];
  const searchActivities = (q: string) => {
    const s = q.trim().toLowerCase();
    return s ? ACTIVITIES.filter((a) => a.toLowerCase().includes(s)).map((name) => ({ name })) : [];
  };

  let adding = $state<null | "exercise" | "superset" | "cardio" | "mobility">(null);

  function addExercise(name: string, superset: boolean) {
    if (!day) return;
    const d = day.id;
    const id = index?.get(name)?.id;
    edit((p, w) => {
      let next = P.addStrengthBlock(p, w, d, { exerciseName: name, exerciseId: id });
      const nb = templateOf(next).days.find((x) => x.id === d)!.blocks.at(-1)!;
      for (let i = 0; i < 3; i++) next = P.addSet(next, w, d, nb.id, { reps: 8, restSec: 120 });
      if (superset) next = P.supersetWithPrevious(next, w, d, nb.id);
      blockId = nb.id;
      return next;
    });
    adding = null;
  }

  function addCardio(name: string) {
    if (!day) return;
    const d = day.id;
    edit((p, w) => {
      const next = P.addCardioBlock(p, w, d, name);
      blockId = templateOf(next).days.find((x) => x.id === d)!.blocks.at(-1)!.id;
      return next;
    });
    adding = null;
  }

  function addMobility(name: string) {
    if (!day) return;
    const d = day.id;
    const drill = BUILTIN_MOBILITY_DRILLS.find((x) => x.name === name);
    const id = createId("pblock");
    edit((p) => mapTemplateDay(p, d, (dd) => ({
      ...dd,
      blocks: [...dd.blocks, {
        type: "mobility", id, orderIndex: dd.blocks.length, drillName: name, ...(drill ? { drillId: drill.id, metric: drill.defaultMetric, perSide: drill.perSide } : {}),
        sets: 2, targetSec: 30, minAppVersion: P.V2_BLOCKS_APP_VERSION,
      }],
    })));
    blockId = id;
    adding = null;
  }

  // ── Circuits and plugin blocks (canvas Q4) ──
  let circuitOpen = $state(false);
  let pluginOpen = $state(false);
  let editingCircuit = $state<P.ProgramCircuit | null>(null);
  let editingPlugin = $state<P.ProgramPluginBlock | null>(null);
  function openCircuit(b: P.ProgramCircuit | null) {
    editingCircuit = b;
    circuitOpen = true;
  }
  function openPluginBlock(b: P.ProgramPluginBlock | null) {
    editingPlugin = b;
    pluginOpen = true;
  }
  /** Adds the block to this day, or changes the one being edited. */
  function putBlock(editing: ProgramBlock | null, fields: Partial<P.ProgramCircuit> | Partial<P.ProgramPluginBlock>, type: "circuit" | "plugin") {
    if (!day) return;
    if (editing) {
      patchBlock(editing.id, fields as Partial<ProgramBlock>);
      return;
    }
    const d = day.id;
    const id = createId("pblock");
    edit((p) => mapTemplateDay(p, d, (dd) => ({
      ...dd,
      blocks: [...dd.blocks, { ...fields, type, id, orderIndex: dd.blocks.length, minAppVersion: P.V2_BLOCKS_APP_VERSION } as ProgramBlock],
    })));
    blockId = id;
  }

  /** Change one day of the built week. */
  function mapTemplateDay(p: CoachProgram, id: string, fn: (d: ProgramDay) => ProgramDay): CoachProgram {
    const w = templateOf(p);
    return { ...p, weeks: p.weeks.map((x) => (x.id === w.id ? { ...x, days: x.days.map((d) => (d.id === id ? fn(d) : d)) } : x)) };
  }
  function patchBlock(id: string, patch: Partial<ProgramBlock> | ((b: ProgramBlock) => ProgramBlock)) {
    if (!day) return;
    const d = day.id;
    edit((p) => mapTemplateDay(p, d, (dd) => ({ ...dd, blocks: dd.blocks.map((b) => (b.id === id ? (typeof patch === "function" ? patch(b) : ({ ...b, ...patch } as ProgramBlock)) : b)) })));
  }

  /** The same targets on every working set of an exercise. */
  function setAll(b: ProgramStrength, field: "reps" | "load" | "rest" | "tempo", text: string, el: HTMLInputElement) {
    let patch: Partial<ProgramSet> | null = null;
    const first = b.sets.find((s) => s.setType !== "warmup") ?? b.sets[0];
    if (field === "reps") patch = P.parseRepsText(text, first?.setType);
    else if (field === "load") patch = P.parseLoadText(text);
    else if (field === "rest") { const r = P.parseRestText(text); patch = r === null ? null : { restSec: r }; }
    else patch = { tempo: text.trim() || undefined };
    if (!patch) {
      el.setCustomValidity(field === "reps" ? "Use 8, 8-10 or AMRAP" : field === "load" ? "Use kilos (60) or a percent (72%)" : "Use 2:30 or 90");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    const p = patch;
    patchBlock(b.id, (x) => (x.type === "strength" ? { ...x, sets: x.sets.map((s) => (field === "rest" || field === "tempo" || s.setType !== "warmup" ? { ...s, ...p } : s)) } : x));
  }

  function setOne(b: ProgramStrength, s: ProgramSet, field: "reps" | "load" | "rpe" | "type", text: string, el?: HTMLInputElement) {
    let patch: Partial<ProgramSet> | null = null;
    if (field === "reps") patch = P.parseRepsText(text, s.setType);
    else if (field === "load") patch = P.parseLoadText(text);
    else if (field === "type") patch = { setType: text as SetType };
    else { const n = text.trim() === "" ? undefined : Number(text.replace(",", ".")); patch = n === undefined || (Number.isFinite(n) && n >= 1 && n <= 10) ? { rpe: n } : null; }
    if (!patch) { el?.setCustomValidity("Check this number"); el?.reportValidity(); return; }
    el?.setCustomValidity("");
    const p = patch;
    patchBlock(b.id, (x) => (x.type === "strength" ? { ...x, sets: x.sets.map((y) => (y.id === s.id ? { ...y, ...p } : y)) } : x));
  }

  function setCount(b: ProgramStrength, n: number) {
    if (!day || n < 1 || n > 12) return;
    const d = day.id;
    edit((p, w) => {
      let next = p;
      const cur = [...b.sets].sort((a, c) => a.orderIndex - c.orderIndex);
      if (n > cur.length) {
        const { id: _i, orderIndex: _o, pinned: _p, ...like } = (cur.at(-1) ?? { reps: 8 }) as ProgramSet;
        for (let k = cur.length; k < n; k++) next = P.addSet(next, w, d, b.id, like);
      } else for (const s of cur.slice(n)) next = P.removeSet(next, w, d, b.id, s.id);
      return next;
    });
  }

  function blockActions(b: ProgramBlock, i: number): RowAction[] {
    if (!day) return [];
    const d = day.id;
    const prev = blocks[i - 1];
    return [
      { id: "up", label: "Move up", run: () => edit((p, w) => P.moveBlock(p, w, d, b.id, -1)), disabled: i === 0 ? "Already first" : undefined },
      { id: "down", label: "Move down", run: () => edit((p, w) => P.moveBlock(p, w, d, b.id, 1)), disabled: i === blocks.length - 1 ? "Already last" : undefined },
      b.supersetGroup
        ? { id: "ungroup", label: "Take out of the superset", run: () => edit((p, w) => P.leaveSuperset(p, w, d, b.id)), separatorBefore: true }
        : { id: "superset", label: "Superset with the one above", run: () => edit((p, w) => P.supersetWithPrevious(p, w, d, b.id)), disabled: !prev || prev.type === "circuit" ? "Nothing above to pair with" : undefined, separatorBefore: true },
      ...(b.type === "circuit" ? [{ id: "edit", label: "Edit circuit…", run: () => openCircuit(b) }] : b.type === "plugin" ? [{ id: "edit", label: `Edit ${b.name}…`, run: () => openPluginBlock(b) }] : []),
      { id: "dup", label: "Duplicate", run: () => duplicateBlock(b) },
      { id: "remove", label: "Remove", danger: true, separatorBefore: true, run: () => { edit((p, w) => P.removeBlock(p, w, d, b.id)); if (blockId === b.id) blockId = null; } },
    ];
  }

  function duplicateBlock(b: ProgramBlock) {
    if (!day) return;
    const d = day.id;
    const copy = structuredClone($state.snapshot(b)) as ProgramBlock;
    const nid = createId("pblock");
    edit((p) => mapTemplateDay(p, d, (dd) => {
      const ordered = [...dd.blocks].sort((a, c) => a.orderIndex - c.orderIndex);
      const at = ordered.findIndex((x) => x.id === b.id) + 1;
      const fresh = { ...copy, id: nid, ...(copy.type === "strength" ? { sets: copy.sets.map((s) => ({ ...s, id: `${s.id}_${nid.slice(-4)}` })) } : {}) } as ProgramBlock;
      const { supersetGroup: _g, ...plain } = fresh as ProgramBlock & { supersetGroup?: string };
      ordered.splice(at, 0, plain as ProgramBlock);
      return { ...dd, blocks: ordered.map((x, k) => ({ ...x, orderIndex: k })) };
    }));
    blockId = nid;
  }

  // ── Days ──
  function addDayNow() {
    edit((p, w) => {
      const next = P.addDay(p, w, `Day ${templateOf(p).days.length + 1}`);
      dayId = templateOf(next).days.at(-1)!.id;
      return next;
    });
    blockId = null;
  }
  function dayActions(d: ProgramDay, i: number): RowAction[] {
    return [
      { id: "up", label: "Move up", run: () => moveDay(d, -1), disabled: i === 0 ? "Already first" : undefined },
      { id: "down", label: "Move down", run: () => moveDay(d, 1), disabled: i === days.length - 1 ? "Already last" : undefined },
      { id: "dup", label: "Duplicate day", run: () => duplicateDay(d), separatorBefore: true },
      { id: "remove", label: "Remove day", danger: true, separatorBefore: true, run: () => { edit((p, w) => P.removeDay(p, w, d.id)); if (dayId === d.id) dayId = null; }, disabled: days.length <= 1 ? "A program needs a day" : undefined },
    ];
  }
  function moveDay(d: ProgramDay, by: -1 | 1) {
    edit((p) => {
      const w = templateOf(p);
      const ordered = [...w.days].sort((a, b) => a.orderIndex - b.orderIndex);
      const i = ordered.findIndex((x) => x.id === d.id);
      const j = i + by;
      if (j < 0 || j >= ordered.length) return p;
      [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
      return { ...p, weeks: p.weeks.map((x) => (x.id === w.id ? { ...x, days: ordered.map((y, k) => ({ ...y, orderIndex: k })) } : x)) };
    });
  }
  function duplicateDay(d: ProgramDay) {
    const nid = createId("pday");
    edit((p) => {
      const w = templateOf(p);
      const copy = structuredClone($state.snapshot(d)) as ProgramDay;
      const fresh: ProgramDay = {
        ...copy, id: nid, name: `${copy.name ?? "Day"} (copy)`, orderIndex: w.days.length,
        blocks: copy.blocks.map((b, k) => ({ ...b, id: `${b.id}_${nid.slice(-4)}`, ...(b.type === "strength" ? { sets: b.sets.map((s) => ({ ...s, id: `${s.id}_${nid.slice(-4)}` })) } : {}), orderIndex: k } as ProgramBlock)),
      };
      return { ...p, weeks: p.weeks.map((x) => (x.id === w.id ? { ...x, days: [...x.days, fresh] } : x)) };
    });
    dayId = nid;
  }

  // ── Program settings ──
  // Canvas PG4: one rule picker, for the program or one exercise.
  let picking = $state(false);
  let pickingFor = $state<ProgramStrength | null>(null);
  function pickRule(rule: ProgramRule | null, scope: "exercise" | "program") {
    const b = pickingFor;
    if (!b || scope === "program") {
      edit((p) => {
        const withRule = { ...p, rule: rule ?? { kind: "fixed" as const } };
        // "The whole program" from an exercise: it follows the program again.
        return b ? mapTemplateDay(withRule, day!.id, (d) => ({ ...d, blocks: d.blocks.map((x) => { if (x.id !== b.id || x.type !== "strength") return x; const { rule: _r, ...rest } = x; return rest; }) })) : withRule;
      });
    } else {
      patchBlock(b.id, (x) => { if (x.type !== "strength") return x; const { rule: _r, ...rest } = x; return rule ? { ...rest, rule } : rest; });
    }
  }
  const lighter = $derived(new Set(prog.weeks.filter((w) => w.lighter).map((w) => w.weekNumber)));
  function toggleLighter(n: number) {
    const next = new Set(lighter);
    if (next.has(n)) next.delete(n); else next.add(n);
    edit((p) => setLighterWeeks(p, [...next]));
  }

  // ── Copies (library, canvas Q6) ──
  let copiesOpen = $state(false);
  let tick = $state<string[]>([]);
  let pushing = $state(false);
  type CopyRow = { id: string; label: string; status: string; own: string[]; behind: boolean; legacy: boolean; nearlyDone: boolean };
  const copyRows = $derived.by((): CopyRow[] => copies.map((c) => {
    const changes = libraryChanges(c.program, prog);
    const legacy = !c.program.libraryBase;
    const progress = P.getProgramProgress(c.program);
    const total = c.program.weeks.length;
    const start = P.getProgramStartMs(c.program);
    const endsMs = start != null ? start + total * 7 * 86_400_000 : null;
    const nearlyDone = progress.status === "finished" || (progress.status === "running" && endsMs != null && endsMs - Date.now() < 7 * 86_400_000);
    const status = progress.status === "running"
      ? `week ${progress.weekNumber} of ${total}${nearlyDone && endsMs ? `, finishing ${new Date(endsMs - 86_400_000).toLocaleDateString(undefined, { weekday: "long" })}` : ""}`
      : progress.status === "scheduled" ? `starts ${new Date(progress.startsAtMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : progress.status === "finished" ? "finished" : "hasn't started";
    // Older copies don't know their library version: behind when the library changed after them.
    const behindNow = legacy ? prog.updatedAtMs > c.program.updatedAtMs : changes.length > 0;
    return { id: c.id, label: c.label, status, own: copyOwnChanges(c.program), behind: behindNow, legacy, nearlyDone };
  }));
  const behind = $derived(copyRows.filter((c) => c.behind));
  /** What you changed, from a copy that remembers the library version it took. */
  const changedLine = $derived.by(() => {
    const withBase = copies.find((c) => c.program.libraryBase && libraryChanges(c.program, prog).length);
    const list = withBase ? libraryChanges(withBase.program, prog) : [];
    return list.length ? `${list.slice(0, 4).join(", ")}${list.length > 4 ? ` and ${list.length - 4} more` : ""}` : null;
  });
  function openCopies() {
    tick = behind.filter((c) => !c.nearlyDone).map((c) => c.id);
    copiesOpen = true;
  }
  async function pushCopies() {
    if (!updateCopies || !tick.length) return;
    pushing = true;
    try {
      await flush();
      await updateCopies($state.snapshot(prog) as CoachProgram, tick);
      copiesOpen = false;
      tick = [];
    } finally {
      pushing = false;
    }
  }

  const fieldCls = "h-9 rounded-[8px] border border-input bg-background px-2.5 text-[13px]";
  const blockMain = (b: ProgramBlock) => (b.type === "strength" ? b.exerciseName : b.type === "circuit" ? b.members.map((m) => m.exerciseName).join(", ") || "Circuit" : P.blockLine(b));
  function blockSub(b: ProgramBlock): string {
    if (b.type === "strength") {
      const first = b.sets.find((s) => s.setType !== "warmup");
      const bits = [P.strengthSummary(b)];
      if (first?.restSec) bits.push(`rest ${P.restText(first.restSec)}`);
      if (first && P.loadText(first)) bits.push(`${P.loadText(first)}${first.percent1RM != null ? " of best" : " kg"}`);
      if (b.rule) bits.push(P.ruleLabel(b.rule));
      if (b.alternatives?.length) bits.push(`swaps: ${b.alternatives.map((a) => a.exerciseName).join(", ")}`);
      return bits.filter(Boolean).join(" · ");
    }
    if (b.type === "cardio") return [b.targetDurationSec ? `${Math.round(b.targetDurationSec / 60)} min` : "", b.targetDistanceM ? `${b.targetDistanceM / 1000} km` : ""].filter(Boolean).join(" · ") || "Cardio";
    if (b.type === "mobility") return [b.sets ? `${b.sets} × ${b.targetSec ?? 30} s` : "", b.perSide ? "each side" : ""].filter(Boolean).join(" · ");
    if (b.type === "plugin") return b.settingsText ?? (Object.values(b.values ?? {}).filter((v) => v != null && v !== "").slice(0, 3).map((v) => (Array.isArray(v) ? v.join(", ") : String(v))).join(" · ") || "Block from a plugin");
    if (b.type === "circuit") return [`${b.rounds} rounds`, b.members.map((m) => `${m.exerciseName} ${m.durationSec ? P.restText(m.durationSec) : `× ${m.reps ?? ""}`}`).join(", "), b.progression === "add-round" ? "+1 round every 2 weeks" : ""].filter(Boolean).join(" · ");
    return "";
  }
  const labels = $derived(day ? P.supersetLabels(day) : new Map<string, string>());
  const sameMuscle = (b: ProgramStrength): string[] => {
    const main = index?.get(b.exerciseName)?.primaryMuscles[0];
    if (!main || !index) return [];
    const taken = new Set([b.exerciseName, ...(b.alternatives ?? []).map((a) => a.exerciseName)].map((n) => n.toLowerCase()));
    return index.list.filter((e) => e.primaryMuscles.includes(main) && !taken.has(e.name.toLowerCase())).slice(0, 5).map((e) => e.name);
  };
  let addingSwap = $state(false);
  let renaming = $state(false);
</script>

<div class="flex flex-col gap-4" data-guide="program-editor">
  <!-- Name, and where things stand -->
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex flex-[2_1_260px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
      <input value={prog.name} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== prog.name) edit((p) => ({ ...p, name: v })); }} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[15px] font-semibold text-foreground" />
    </label>
    <label class="flex flex-[3_1_320px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Description <span class="sr-only">(clients see this)</span>
      <input value={prog.description ?? ""} placeholder="Upper / lower, 4 days. Clients see this." onchange={(e) => { const v = e.currentTarget.value.trim() || undefined; if (v !== prog.description) edit((p) => ({ ...p, description: v })); }} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground" />
    </label>
    <span class="ml-auto flex items-center gap-1" data-guide="program-save">
      <span class="mr-1 text-xs {status === 'error' ? 'text-destructive' : 'text-muted-foreground'}" role="status">{statusText}</span>
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl Z)" disabled={!past.length} onclick={undo}><Undo2Icon class="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!future.length} onclick={redo}><Redo2Icon class="size-4" /></Button>
      <Button variant="outline" size="sm" onclick={() => (view = view === "days" ? "weeks" : "days")}>{view === "days" ? "See every week" : "Back to the days"}</Button>
      {#if mode === "library" && behind.length && updateCopies}
        <Button variant="outline" size="sm" onclick={openCopies}>Update {behind.length} {behind.length === 1 ? "client" : "clients"}…</Button>
      {/if}
    </span>
  </div>

  <!-- Rule, length, lighter weeks, start -->
  <section class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[10px] bg-muted/60 px-4 py-3 text-[13px]">
    <span class="flex items-center gap-2">
      <span class="text-muted-foreground">Rule for every exercise</span>
      <b class="font-semibold">{P.ruleLabel(prog.rule)}</b>
      <Button variant="outline" size="sm" onclick={() => { pickingFor = null; picking = true; }}>Change</Button>
    </span>
    <span class="flex items-center gap-2">
      <span class="text-muted-foreground">Length</span>
      <Button variant="outline" size="icon" class="size-7" aria-label="One week fewer" disabled={prog.weeks.length <= 1} onclick={() => edit((p) => setLength(p, p.weeks.length - 1))}>−</Button>
      <span class="w-16 text-center tabular-nums">{prog.weeks.length} {prog.weeks.length === 1 ? "week" : "weeks"}</span>
      <Button variant="outline" size="icon" class="size-7" aria-label="One week more" disabled={prog.weeks.length >= 52} onclick={() => edit((p) => setLength(p, p.weeks.length + 1))}>+</Button>
    </span>
    {#if prog.weeks.length > 1}
      <span class="flex flex-wrap items-center gap-1.5">
        <span class="text-muted-foreground">Lighter weeks</span>
        {#each prog.weeks.map((w) => w.weekNumber).sort((a, b) => a - b) as n (n)}
          <button type="button" aria-pressed={lighter.has(n)} onclick={() => toggleLighter(n)}
            class="h-7 min-w-7 rounded-full border px-2 text-xs tabular-nums transition-colors {lighter.has(n) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}">{n}</button>
        {/each}
        <span class="text-xs text-muted-foreground">fewer sets, same weight</span>
      </span>
    {/if}
    {#if mode === "copy"}
      <span class="flex items-center gap-2">
        <span class="text-muted-foreground">Starts</span>
        <OptionSelect size="sm" value={prog.startMode === "fixed-date" ? "fixed-date" : "manual"} aria-label="Starts"
          onValueChange={(m) => edit((p) => (m === "fixed-date" ? P.setProgramStart(p, { mode: "fixed-date", startDateMs: p.startDateMs ?? P.startOfLocalDayMs() }) : P.setProgramStart(p, { mode: "manual" })))}
          options={[{ value: "manual", label: "When they tap Start" }, { value: "fixed-date", label: "On a date" }]} />
        {#if prog.startMode === "fixed-date"}
          <DateField aria-label="Start date" class="h-8 w-auto text-[13px]"
            bind:value={() => (prog.startDateMs != null ? P.toDateInputValue(prog.startDateMs) : undefined), (v) => { const ms = v ? P.fromDateInputValue(v) : null; if (ms != null) edit((p) => P.setProgramStart(p, { mode: "fixed-date", startDateMs: ms })); }} />
        {/if}
      </span>
    {:else}
      <span class="text-muted-foreground">Starts: chosen when you assign it</span>
    {/if}
  </section>

  {#if view === "weeks"}
    <ProgramWeeks program={prog} {mode} {clientId} {preview} edit={(fn) => edit((p) => fn(p))} />
  {:else}
  <div class="flex flex-wrap items-start gap-4">
    <!-- Days -->
    <nav aria-label="Days" class="flex w-full flex-col gap-1 rounded-[10px] border border-border bg-card p-1.5 sm:w-56">
      {#each days as d, i (d.id)}
        <ActionMenu actions={dayActions(d, i)} label="More for {d.name ?? `Day ${i + 1}`}">
          {#snippet children({ props, more })}
            <div {...props} class="flex items-center rounded-lg {d.id === day?.id ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
              <button type="button" aria-current={d.id === day?.id ? "true" : undefined} onclick={() => { dayId = d.id; blockId = null; }} class="flex min-w-0 flex-1 flex-col px-3 py-2 text-left">
                <span class="truncate text-[13px] font-semibold">{d.name ?? `Day ${i + 1}`}</span>
                <span class="text-xs text-muted-foreground">{d.weekday != null ? `${WEEKDAYS[d.weekday]} · ` : ""}{d.blocks.length} {d.blocks.length === 1 ? "block" : "blocks"}</span>
              </button>
              {@render more()}
            </div>
          {/snippet}
        </ActionMenu>
      {/each}
      <Button variant="ghost" size="sm" class="justify-start" onclick={addDayNow}>+ Day</Button>
    </nav>

    <!-- The day -->
    {#if day}
      <section class="flex min-w-0 flex-[2_1_420px] flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-3.5">
        <div class="flex flex-wrap items-center gap-2">
          {#key day.id}
            <input aria-label="Day name" value={day.name ?? ""} onchange={(e) => { const v = e.currentTarget.value.trim() || undefined; const id = day.id; edit((p, w) => P.updateDay(p, w, id, { name: v })); }}
              class="h-9 min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 text-[17px] font-bold hover:border-input focus:border-input" />
          {/key}
        </div>
        <!-- What the time is for: the client's meal plan times meals around it. It sends nothing. -->
        <div class="flex flex-wrap items-center gap-2 text-[13px]">
          {#key day.id}
            <span class="text-muted-foreground">Training time</span>
            <TimeField aria-label="Training time" value={day.sessionTime}
              onchange={(v) => { const id = day.id; edit((p) => mapTemplateDay(p, id, (d) => ({ ...d, sessionTime: v || undefined }))); }} />
            {#if day.sessionTime}
              <Button variant="ghost" size="sm" onclick={() => { const id = day.id; edit((p) => mapTemplateDay(p, id, (d) => ({ ...d, sessionTime: undefined }))); }}>Clear</Button>
            {/if}
            <span class="text-xs text-muted-foreground">Optional. Meal plans time meals around it ("2 hours before training"). No reminder is sent.</span>
          {/key}
        </div>
        <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Which day">
          {#each WEEK_ORDER as wd (wd)}
            <button type="button" role="radio" aria-checked={day.weekday === wd} onclick={() => { const id = day.id; edit((p, w) => P.updateDay(p, w, id, { weekday: wd })); }}
              class="h-8 rounded-full border px-3 text-xs transition-colors {day.weekday === wd ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">{WEEKDAYS[wd]}</button>
          {/each}
          <button type="button" role="radio" aria-checked={day.weekday == null} onclick={() => { const id = day.id; edit((p, w) => P.updateDay(p, w, id, { weekday: undefined })); }}
            class="h-8 rounded-full border px-3 text-xs transition-colors {day.weekday == null ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">Any day</button>
        </div>

        <ul class="flex flex-col gap-1.5" aria-label="Blocks">
          {#each blocks as b, i (b.id)}
            {@const grouped = b.supersetGroup && labels.get(b.id)}
            <li>
              <ActionMenu actions={blockActions(b, i)} label="More for {blockMain(b)}">
                {#snippet children({ props, more })}
                  <div {...props} class="flex items-center gap-2 rounded-[9px] border px-3 py-2 transition-colors {b.id === blockId ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/40'} {grouped ? 'ml-3 border-l-4 border-l-muted-foreground/40' : ''}">
                    {#if grouped}<span class="rounded-[5px] bg-muted-foreground px-1.5 text-[11px] font-bold text-background">{labels.get(b.id)}</span>{/if}
                    <button type="button" onclick={() => (blockId = b.id)} class="flex min-w-0 flex-1 flex-col text-left">
                      <span class="truncate text-[13px] font-semibold">{#if b.type !== "strength"}<span class="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{b.type === "cardio" ? "Cardio" : b.type === "mobility" ? "Mobility" : b.type === "plugin" ? "Plugin" : b.type === "circuit" ? "Circuit" : ""}</span>{/if}{blockMain(b)}</span>
                      <span class="truncate text-xs text-muted-foreground">{blockSub(b)}</span>
                    </button>
                    {@render more()}
                  </div>
                {/snippet}
              </ActionMenu>
            </li>
          {:else}
            <li class="rounded-[9px] border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">No exercises yet. Add the first one below.</li>
          {/each}
        </ul>

        {#if adding}
          <div class="rounded-[9px] border border-border p-2">
            {#if adding === "exercise" || adding === "superset"}
              <NamePicker id="add-exercise" label={adding === "superset" ? "Exercise in a superset with the last one" : "Exercise"} placeholder="Search exercises" autofocus search={searchExercises} onPick={(n) => addExercise(n, adding === "superset")} onCancel={() => (adding = null)} />
            {:else if adding === "cardio"}
              <NamePicker id="add-cardio" label="Cardio" placeholder="Walk, bike, rower…" autofocus search={searchActivities} onPick={addCardio} onCancel={() => (adding = null)} />
            {:else}
              <NamePicker id="add-mobility" label="Mobility drill" placeholder="Search drills" autofocus search={searchDrills} onPick={addMobility} onCancel={() => (adding = null)} />
            {/if}
          </div>
        {/if}
        <div class="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onclick={() => (adding = "exercise")}>+ Exercise</Button>
          <Button variant="outline" size="sm" disabled={!blocks.length} onclick={() => (adding = "superset")}>+ Superset</Button>
          <Button variant="outline" size="sm" onclick={() => (adding = "cardio")}>+ Cardio</Button>
          <Button variant="outline" size="sm" onclick={() => (adding = "mobility")}>+ Mobility</Button>
          <Button variant="outline" size="sm" onclick={() => openCircuit(null)}>+ Circuit</Button>
          <Button variant="outline" size="sm" onclick={() => openPluginBlock(null)}>+ From a plugin</Button>
        </div>
      </section>
    {/if}

    <!-- The selected block -->
    {#if block}
      <aside class="flex w-full flex-col gap-3.5 rounded-[10px] border border-border bg-card px-4 py-3.5 lg:w-80" aria-label="{blockMain(block)} settings">
        {#if block.type === "strength"}
          {@const b = block}
          {@const first = b.sets.find((s) => s.setType !== "warmup") ?? b.sets[0]}
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[15px] font-bold">{b.exerciseName}</h3>
            <Button variant="ghost" size="sm" onclick={() => (renaming = !renaming)}>Change</Button>
          </div>
          {#if renaming}
            <NamePicker id="rename-ex" label="Change to" placeholder="Search exercises" autofocus search={searchExercises}
              onPick={(n) => { patchBlock(b.id, { exerciseName: n, exerciseId: index?.get(n)?.id } as Partial<ProgramBlock>); renaming = false; }} onCancel={() => (renaming = false)} />
          {/if}
          {#key b.id}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label>Sets</Label>
                <span class="flex items-center gap-1.5">
                  <Button variant="outline" size="icon" class="size-8" aria-label="One set fewer" disabled={b.sets.length <= 1} onclick={() => setCount(b, b.sets.length - 1)}>−</Button>
                  <span class="w-6 text-center tabular-nums">{b.sets.length}</span>
                  <Button variant="outline" size="icon" class="size-8" aria-label="One set more" onclick={() => setCount(b, b.sets.length + 1)}>+</Button>
                </span>
              </div>
              <div class="flex flex-col gap-1.5"><Label for="ex-reps">Reps</Label><input id="ex-reps" class={fieldCls} value={first ? P.repsText(first) : ""} placeholder="6-8" onchange={(e) => setAll(b, "reps", e.currentTarget.value, e.currentTarget)} /></div>
              <div class="flex flex-col gap-1.5"><Label for="ex-load">Load</Label><input id="ex-load" class={fieldCls} value={first ? P.loadText(first) : ""} placeholder="60 or 72%" onchange={(e) => setAll(b, "load", e.currentTarget.value, e.currentTarget)} /></div>
              <div class="flex flex-col gap-1.5"><Label for="ex-rest">Rest</Label><input id="ex-rest" class={fieldCls} value={P.restText(first?.restSec)} placeholder="2:30" onchange={(e) => setAll(b, "rest", e.currentTarget.value, e.currentTarget)} /></div>
              <div class="col-span-2 flex flex-col gap-1.5"><Label for="ex-tempo">Tempo <span class="font-normal text-muted-foreground">optional</span></Label><input id="ex-tempo" class={fieldCls} value={first?.tempo ?? ""} placeholder="3-1-1-0" onchange={(e) => setAll(b, "tempo", e.currentTarget.value, e.currentTarget)} /></div>
            </div>
            <details class="text-[13px]">
              <summary class="cursor-pointer text-xs font-medium text-muted-foreground">Each set (warm-ups, drop sets, RPE)</summary>
              <table class="mt-2 w-full text-xs">
                <thead><tr class="text-left text-muted-foreground"><th class="py-1 font-medium">#</th><th class="font-medium">Type</th><th class="font-medium">Reps</th><th class="font-medium">Load</th><th class="font-medium">RPE</th></tr></thead>
                <tbody>
                  {#each [...b.sets].sort((x, y) => x.orderIndex - y.orderIndex) as s, k (s.id)}
                    <tr>
                      <td class="py-1 pr-1 text-muted-foreground">{k + 1}</td>
                      <td class="pr-1"><OptionSelect size="sm" value={s.setType} aria-label="Set {k + 1} type" options={setTypes.map((m) => ({ value: m.type, label: m.label }))} onValueChange={(v) => setOne(b, s, "type", v)} /></td>
                      <td class="pr-1"><input class="h-8 w-14 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} reps" value={P.repsText(s)} onchange={(e) => setOne(b, s, "reps", e.currentTarget.value, e.currentTarget)} /></td>
                      <td class="pr-1"><input class="h-8 w-14 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} load" value={P.loadText(s)} onchange={(e) => setOne(b, s, "load", e.currentTarget.value, e.currentTarget)} /></td>
                      <td><input class="h-8 w-11 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} RPE" value={s.rpe ?? ""} onchange={(e) => setOne(b, s, "rpe", e.currentTarget.value, e.currentTarget)} /></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </details>
            <div class="flex items-center justify-between gap-2">
              <span class="flex flex-col"><Label>Rule</Label><span class="text-[13px]">{b.rule ? P.ruleLabel(b.rule) : `The program's · ${P.ruleLabel(prog.rule)}`}</span></span>
              <Button variant="outline" size="sm" onclick={() => { pickingFor = b; picking = true; }}>Change</Button>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Swaps they can use</Label>
              <div class="flex flex-wrap gap-1.5">
                {#each b.alternatives ?? [] as a (a.exerciseName)}
                  <span class="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{a.exerciseName}
                    <button type="button" aria-label="Remove {a.exerciseName}" class="flex size-5 items-center justify-center rounded-full hover:bg-background" onclick={() => edit((p) => P.removeAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, a.exerciseName))}>×</button>
                  </span>
                {:else}
                  <span class="text-xs text-muted-foreground">{swapRule === "list" ? "None yet, so it can't be swapped" : swapRule === "muscles" ? "None yet, so same-muscle exercises" : "None yet, so any exercise"}</span>
                {/each}
              </div>
              {#if addingSwap}
                <NamePicker id="add-swap" label="Swap" placeholder="Search exercises" autofocus search={(q) => searchExercises(q).filter((r) => r.name !== b.exerciseName)}
                  onPick={(n) => { edit((p) => P.addAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, { exerciseName: n, exerciseId: index?.get(n)?.id })); addingSwap = false; }} onCancel={() => (addingSwap = false)} />
              {:else}
                <span class="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onclick={() => (addingSwap = true)}>+ Swap</Button>
                  {#each sameMuscle(b).slice(0, 3) as n (n)}
                    <Button variant="ghost" size="sm" onclick={() => edit((p) => P.addAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, { exerciseName: n, exerciseId: index?.get(n)?.id }))}>+ {n}</Button>
                  {/each}
                </span>
              {/if}
            </div>
          {/key}
        {:else if block.type === "cardio"}
          {@const b = block}
          <h3 class="text-[15px] font-bold">{b.activityName}</h3>
          {#key b.id}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label for="cd-min">Minutes</Label><input id="cd-min" class={fieldCls} inputmode="numeric" value={b.targetDurationSec ? Math.round(b.targetDurationSec / 60) : ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { targetDurationSec: n > 0 ? Math.round(n * 60) : undefined } as Partial<ProgramBlock>); }} /></div>
              <div class="flex flex-col gap-1.5"><Label for="cd-km">Kilometres</Label><input id="cd-km" class={fieldCls} inputmode="decimal" value={b.targetDistanceM ? b.targetDistanceM / 1000 : ""} onchange={(e) => { const n = Number(e.currentTarget.value.replace(",", ".")); patchBlock(b.id, { targetDistanceM: n > 0 ? Math.round(n * 1000) : undefined } as Partial<ProgramBlock>); }} /></div>
            </div>
          {/key}
        {:else if block.type === "mobility"}
          {@const b = block}
          <h3 class="text-[15px] font-bold">{b.drillName}</h3>
          {#key b.id}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label for="mo-sets">Sets</Label><input id="mo-sets" class={fieldCls} inputmode="numeric" value={b.sets ?? ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { sets: n > 0 ? Math.min(10, Math.round(n)) : undefined } as Partial<ProgramBlock>); }} /></div>
              <div class="flex flex-col gap-1.5"><Label for="mo-hold">Hold (seconds)</Label><input id="mo-hold" class={fieldCls} inputmode="numeric" value={b.targetSec ?? ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { targetSec: n > 0 ? Math.round(n) : undefined } as Partial<ProgramBlock>); }} /></div>
            </div>
            <label class="flex items-center justify-between gap-3 text-[13px]"><span>Each side</span><Switch checked={!!b.perSide} onCheckedChange={(v) => patchBlock(b.id, { perSide: v } as Partial<ProgramBlock>)} /></label>
            <p class="text-xs text-muted-foreground">Progresses like their own mobility drills. Needs LogIt {P.V2_BLOCKS_APP_VERSION} or newer on their phone.</p>
          {/key}
        {:else if block.type === "circuit"}
          {@const b = block}
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[15px] font-bold">Circuit · {b.rounds} {b.rounds === 1 ? "round" : "rounds"}</h3>
            <Button variant="outline" size="sm" onclick={() => openCircuit(b)}>Edit…</Button>
          </div>
          <ul class="flex flex-col gap-1 text-[13px]">
            {#each b.members as m (m.id)}<li class="flex justify-between gap-2"><span>{m.exerciseName}</span><span class="text-muted-foreground">{m.durationSec ? P.restText(m.durationSec) : `${m.reps ?? ""} reps`}</span></li>{/each}
          </ul>
          <p class="text-xs text-muted-foreground">Rest {P.restText(b.memberRestSec ?? 0)} between exercises, {P.restText(b.roundRestSec ?? 0)} between rounds · {b.progression === "add-round" ? "+1 round every 2 weeks" : b.progression === "each" ? "each exercise's own rule" : "same every week"}. Needs LogIt {P.V2_BLOCKS_APP_VERSION} or newer on their phone.</p>
        {:else if block.type === "plugin"}
          {@const b = block}
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[15px] font-bold">{b.name}</h3>
            <Button variant="outline" size="sm" onclick={() => openPluginBlock(b)}>Edit…</Button>
          </div>
          <p class="text-[13px]">{blockSub(b)}</p>
          <p class="text-xs text-muted-foreground">From a plugin. Clients are asked to allow it; until they do, it's a note in their workout.</p>
        {:else}
          <h3 class="text-[15px] font-bold">{blockMain(block)}</h3>
          <p class="text-xs text-muted-foreground">{blockSub(block)}</p>
        {/if}
        {#key block.id}
          <div class="flex flex-col gap-1.5">
            <Label for="blk-note">Note for the client</Label>
            <Textarea id="blk-note" rows={2} value={block.note ?? ""} placeholder={block.type === "strength" ? "Pause 1 second on the chest" : "Anything they should know"} onchange={(e) => { const v = e.currentTarget.value.trim() || undefined; patchBlock(block.id, { note: v } as Partial<ProgramBlock>); }} />
          </div>
        {/key}
      </aside>
    {/if}
  </div>
  {/if}
  <p class="text-xs text-muted-foreground">You're building one week; it applies to all {prog.weeks.length} {prog.weeks.length === 1 ? "week" : "weeks"}. Changes save as you go. Ctrl Z undoes.</p>
</div>

<Dialog.Root bind:open={copiesOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Update clients on {prog.name}?</Dialog.Title>
      <Dialog.Description>{changedLine ? `You changed: ${changedLine}. ` : ""}{copies.length} {copies.length === 1 ? "client has their" : "clients have their"} own copy.</Dialog.Description>
    </Dialog.Header>
    <ul class="flex flex-col">
      {#each copyRows as c (c.id)}
        <li class="flex items-start justify-between gap-3 border-t border-border py-2.5 text-[13px]">
          <span class="flex flex-col gap-0.5">
            <span><b class="font-medium">{c.label}</b> <span class="text-muted-foreground">· {c.status}</span></span>
            {#if !c.behind}<span class="text-xs text-muted-foreground">Already up to date.</span>
            {:else if c.legacy}<span class="text-xs text-muted-foreground">Made before LogIt kept track of changes for them, so it becomes the library version.</span>
            {:else if c.own.length}<span class="text-xs text-muted-foreground">Their copy has your own changes for them ({c.own.slice(0, 2).join(", ")}{c.own.length > 2 ? "…" : ""}). Kept.</span>{/if}
            {#if c.behind && c.nearlyDone && !tick.includes(c.id)}<span class="text-xs text-muted-foreground">Left as is: nearly done.</span>{/if}
          </span>
          <Switch aria-label="Update {c.label}" disabled={!c.behind} checked={tick.includes(c.id)} onCheckedChange={(v) => (tick = v ? [...tick, c.id] : tick.filter((x) => x !== c.id))} />
        </li>
      {/each}
    </ul>
    <p class="text-xs text-muted-foreground">Updating keeps each client's start date, the week they're on and everything they've logged. Changes apply from their next session. Unticked copies stay as they are.</p>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (copiesOpen = false)}>Only the library</Button>
      <Button disabled={pushing || !tick.length} onclick={() => void pushCopies()}>{pushing ? "Updating…" : `Update ${tick.length} ${tick.length === 1 ? "client" : "clients"}`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Canvas Z6: only when both changed the same thing. -->
<Dialog.Root open={conflicts.length > 0} onOpenChange={(o) => { if (!o) { conflicts = []; theirsForConflicts = null; } }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Changed somewhere else too</Dialog.Title>
      <Dialog.Description>While this was open, the same {conflicts.length === 1 ? "thing was" : "things were"} changed on another device. Pick which to keep.</Dialog.Description>
    </Dialog.Header>
    <ul class="flex flex-col gap-3">
      {#each conflicts as c (c.key)}
        <li class="flex flex-col gap-2 rounded-[10px] bg-muted px-3.5 py-3 text-[13px]">
          <b class="font-semibold">{c.label}</b>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onclick={() => resolve(c, true)}>Use the other one · {c.theirs}</Button>
            <Button size="sm" onclick={() => resolve(c, false)}>Keep this one · {c.mine}</Button>
          </div>
        </li>
      {/each}
    </ul>
  </Dialog.Content>
</Dialog.Root>

<CircuitDialog bind:open={circuitOpen} dayName={day?.name || "this day"} editing={editingCircuit} {index} onsave={(c) => putBlock(editingCircuit, c, "circuit")} />
<PluginBlockDialog bind:open={pluginOpen} dayName={day?.name || "this day"} editing={editingPlugin} onsave={(b) => putBlock(editingPlugin, b, "plugin")} />

<RulePickerDialog bind:open={picking} current={pickingFor ? (pickingFor.rule ?? null) : (prog.rule ?? null)} exercise={pickingFor?.exerciseName ?? null} onpick={pickRule} />
