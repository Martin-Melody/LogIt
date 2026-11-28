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
  import PluginBlockDialog from "./PluginBlockDialog.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import AddToDayDialog, { type AddPick } from "./AddToDayDialog.svelte";
  import GroupDialog from "./GroupDialog.svelte";
  import WeekRangeDialog from "./WeekRangeDialog.svelte";
  import StretchDialog, { type StretchPack } from "./StretchDialog.svelte";
  import StretchBar from "./StretchBar.svelte";
  import { fitStretches, putStretch, removeStretch, stretchesOf, stretchTitle, type Stretch } from "@logit/core/domain/stretches";
  import { parsePhasePack } from "@logit/core/plugins/phasePack";
  import { plugins as installedPlugins, fetchSource } from "$lib/features/plugins/pluginData.svelte";
  import { cardioPlanned } from "@logit/core/domain/programDaySession";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { createReorder, SLIDE_MS } from "$lib/reorder.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { guideSignal } from "$lib/features/guide/signal";
  import { getWebCoachProgramRepo } from "$lib/deps";
  import * as P from "@logit/core/domain/CoachProgram";
  import WeeksDialog from "./WeeksDialog.svelte";
  import type { CoachProgram, ProgramBlock, ProgramDay, ProgramRule, ProgramSet, ProgramStrength } from "@logit/core/domain/CoachProgram";
  import { applyTemplate, copyOwnChanges, forBuilder, libraryChanges, mergePrograms, setLength, takeTheirs, templateOf, type MergeConflict } from "@logit/core/domain/programBuilder";
  import { BUILTIN_MOBILITY_DRILLS } from "@logit/core/domain/mobilityDrill";
  import { createId } from "@logit/core/domain/ids";
  import { SET_TYPE_META, type SetType } from "@logit/core/domain/workout";
  import type { SwapRule } from "@logit/core/domain/swaps";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { warmupSets } from "@logit/core/domain/warmup";
  import { DEFAULT_MOBILITY_ALGORITHM_ID } from "@logit/core/usecases/progression/getMobilityProgressionConfig";
  import { SAME_EVERY_TIME_ID } from "@logit/core/progression/algorithms/sameEveryTime";

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

  // One Add dialog for the day (canvas PB4).
  let addOpen = $state(false);
  /** "+ Exercise to this superset": what's picked joins that group (canvas PB2). */
  let addTo = $state<string | null>(null);
  $effect(() => { if (!addOpen) addTo = null; });
  function addPicks(picks: AddPick[], as: "one" | "group" | "circuit", inRange = false) {
    if (!day || !picks.length) return;
    const d = day.id;
    const before = new Set(blocks.map((b) => b.id));
    addPicksAll(picks, as);
    // Canvas PX2: added while editing some weeks, they run in those weeks only.
    const range = inRange ? editing : null;
    const fresh = range ? (templateOf(prog).days.find((x) => x.id === d)?.blocks ?? []).filter((b) => !before.has(b.id)) : [];
    if (range && fresh.length) edit((p, w) => fresh.reduce((q, b) => P.setBlockWeeks(q, w, d, b.id, range), p));
  }

  function addPicksAll(picks: AddPick[], as: "one" | "group" | "circuit") {
    if (!day) return;
    const into = addTo;
    addTo = null;
    if (into) {
      const d = day.id;
      for (const pk of picks) {
        if (pk.kind === "strength") addExercise(pk.name, false);
        else if (pk.kind === "cardio") addCardio(pk.name);
        else addMobility(pk.name);
        const nid = blockId;
        if (nid) edit((p, w) => P.addToGroup(p, w, d, nid, into));
      }
      return;
    }
    const ids: string[] = [];
    for (const pk of picks) {
      if (pk.kind === "strength") addExercise(pk.name, false);
      else if (pk.kind === "cardio") addCardio(pk.name);
      else addMobility(pk.name);
      if (blockId) ids.push(blockId);
    }
    // Several as a superset or circuit (canvas PB15): one group, and its settings open.
    if (as !== "one" && ids.length > 1) {
      const d = day.id, gid = createId("grp");
      edit((p, w) => P.setGroup(
        mapTemplateDay(p, d, (dd) => ({ ...dd, blocks: dd.blocks.map((b) => (ids.includes(b.id) ? ({ ...b, supersetGroup: gid } as ProgramBlock) : b)) })),
        w, d, gid, as === "circuit" ? { kind: "circuit", memberRestSec: 15, roundRestSec: 90 } : { kind: "superset" },
      ));
      blockId = null;
      openGroup(gid, true);
    }
  }

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
  }

  function addCardio(name: string) {
    if (!day) return;
    const d = day.id;
    edit((p, w) => {
      const next = P.addCardioBlock(p, w, d, name);
      blockId = templateOf(next).days.find((x) => x.id === d)!.blocks.at(-1)!.id;
      return next;
    });
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
  }

  // ── Circuits and plugin blocks (canvas Q4) ──
  let pluginOpen = $state(false);
  let editingPlugin = $state<P.ProgramPluginBlock | null>(null);
  /** An old circuit block turns into a group of its exercises, then its settings open (PB16). */
  function openCircuit(b: P.ProgramCircuit | null) {
    if (!day || !b) return;
    const d = day.id;
    let gid = "";
    edit((p, w) => { const out = P.circuitToGroup(p, w, d, b.id, () => createId("pblock")); gid = out.groupId; return out.program; });
    if (blockId === b.id) blockId = null;
    if (gid) openGroup(gid);
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

  /** Changes an exercise's sets, reps, rest or progression: in the weeks being edited only
   * (canvas PX3), or every week. */
  function patchNumbers(id: string, fn: (x: ProgramStrength) => ProgramStrength) {
    const r = editing;
    patchBlock(id, (x) => (x.type !== "strength" ? x : r ? P.setNumbersInWeeks(x, r, fn) : fn(x)));
  }

  /** The same targets on every working set of an exercise. */
  function setAll(b: ProgramStrength, field: "reps" | "load" | "rest" | "tempo" | "hold" | "distance", text: string, el: HTMLInputElement) {
    let patch: Partial<ProgramSet> | null = null;
    const first = b.sets.find((s) => s.setType !== "warmup") ?? b.sets[0];
    if (field === "hold") { const r = P.parseRestText(text); patch = r === null ? null : { durationSec: r }; }
    else if (field === "distance") { const m = text.trim() === "" ? undefined : Number(text.replace(/m$/i, "").trim()); patch = m === undefined || (Number.isFinite(m) && m > 0) ? { distanceM: m } : null; }
    else if (field === "reps") patch = P.parseRepsText(text, first?.setType);
    else if (field === "load") patch = P.parseLoadText(text);
    else if (field === "rest") { const r = P.parseRestText(text); patch = r === null ? null : { restSec: r }; }
    else patch = { tempo: text.trim() || undefined };
    if (!patch) {
      el.setCustomValidity(field === "reps" ? "Use 8, 8-10 or AMRAP" : field === "load" ? "Use kilos (60) or a percent (72%)" : field === "distance" ? "Use metres, like 40" : "Use 2:30 or 90");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    const p = patch;
    patchNumbers(b.id, (x) => ({ ...x, sets: x.sets.map((s) => (field === "rest" || field === "tempo" || s.setType !== "warmup" ? { ...s, ...p } : s)) }));
  }

  function setOne(b: ProgramStrength, s: ProgramSet, field: "reps" | "load" | "rpe" | "type" | "rest", text: string, el?: HTMLInputElement) {
    let patch: Partial<ProgramSet> | null = null;
    if (field === "rest") { const sec = text.trim() ? P.parseRestText(text) : undefined; patch = sec === null ? null : { restSec: sec }; }
    else
    if (field === "reps") patch = P.parseRepsText(text, s.setType);
    else if (field === "load") patch = P.parseLoadText(text);
    else if (field === "type") patch = { setType: text as SetType };
    else { const n = text.trim() === "" ? undefined : Number(text.replace(",", ".")); patch = n === undefined || (Number.isFinite(n) && n >= 1 && n <= 10) ? { rpe: n } : null; }
    if (!patch) { el?.setCustomValidity("Check this number"); el?.reportValidity(); return; }
    el?.setCustomValidity("");
    const p = patch;
    patchNumbers(b.id, (x) => ({ ...x, sets: x.sets.map((y) => (y.id === s.id ? { ...y, ...p } : y)) }));
  }

  function setCount(b: ProgramStrength, n: number) {
    if (!day || n < 1 || n > 12) return;
    patchNumbers(b.id, (x) => {
      const cur = [...x.sets].sort((a, c) => a.orderIndex - c.orderIndex);
      if (n <= cur.length) return { ...x, sets: cur.slice(0, n) };
      const { id: _i, orderIndex: _o, pinned: _p, ...like } = (cur.at(-1) ?? { setType: "normal", reps: 8 }) as ProgramSet;
      return { ...x, sets: [...cur, ...Array.from({ length: n - cur.length }, (_, k): ProgramSet => ({ ...like, id: createId("pset"), orderIndex: cur.length + k }))] };
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
      ...(b.type === "strength" && prog.weeks.length > 1 ? [{ id: "replace-from", label: "Replace from week…", separatorBefore: true, run: () => openRange(b, "replace") }] : []),
      ...(prog.weeks.length > 1 ? [{ id: "some-weeks", label: "Only in some weeks…", ...(b.type === "strength" ? {} : { separatorBefore: true }), run: () => openRange(b, "some") }] : []),
      ...(editing && b.type === "strength" ? [{ id: "swap-weeks", label: `Swap for ${editingText.toLowerCase()}…`, separatorBefore: true, run: () => (swapping = b) }] : []),
      { id: "dup", label: "Duplicate", run: () => duplicateBlock(b) },
      ...(editing ? [{ id: "take-out", label: `Take out of ${editingText.toLowerCase()}`, danger: true, separatorBefore: true, run: () => { const r = editing!; edit((p, w) => P.takeOutOfWeeks(p, w, d, b.id, r, createId("pblock"))); if (blockId === b.id) blockId = null; } }] : []),
      { id: "remove", label: editing ? "Remove from every week" : "Remove", danger: true, separatorBefore: !editing, run: () => { edit((p, w) => P.removeBlock(p, w, d, b.id)); if (blockId === b.id) blockId = null; } },
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
      patchNumbers(b.id, (x) => { const { rule: _r, ...rest } = x; return rule ? { ...rest, rule } : rest; });
    }
  }
  // The program's weeks as stretches (canvas PW1–PW4): one idea for phases and week types.
  let weeksOpen = $state(false);
  let stretchOpen = $state(false);
  let stretchEditing = $state<Stretch | null>(null);
  let stretchStart = $state<{ from: number; to: number }>({ from: 1, to: 1 });
  const stretches = $derived(stretchesOf(prog));
  function openStretch(s: Stretch | null) {
    stretchEditing = s && !s.plain ? s : null;
    // A plain stretch opens as a new one over its weeks.
    const free = stretches.find((x) => x.plain);
    stretchStart = s ? { from: s.from, to: s.to } : free ? { from: free.from, to: free.to } : { from: prog.weeks.length, to: prog.weeks.length };
    stretchOpen = true;
  }
  /** The edge after stretch i moved: the next one now starts at `start`. The one that grows takes
   * the weeks; if that's the program's plain progression, the other one shrinks instead. */
  function moveEdge(i: number, start: number) {
    const left = stretches[i], right = stretches[i + 1];
    if (!left || !right) return;
    const leftGrows = start > right.from;
    const grow = leftGrows ? left : right;
    const id = () => createId("phase");
    edit((p) => {
      if (!grow.plain) return putStretch(p, leftGrows ? { ...left, to: start - 1 } : { ...right, from: start }, id, grow);
      return leftGrows ? putStretch(p, { ...right, from: start }, id, right) : putStretch(p, { ...left, to: start - 1 }, id, left);
    });
  }
  function setWeeks(n: number) {
    edit((p) => fitStretches(setLength(p, n), p.weeks.length));
  }
  // Starting phases from installed phase packs (canvas SP8).
  let phasePacks = $state<StretchPack[]>([]);
  $effect(() => {
    if (!stretchOpen) return;
    void (async () => {
      if (!installedPlugins.installsLoaded) await installedPlugins.loadInstalls().catch(() => {});
      const found = installedPlugins.installed.filter((p) => p.enabled && p.manifest.family === "phase-pack" && p.manifest.id !== P.FIND_YOUR_WEIGHTS_PACK.id);
      phasePacks = (await Promise.all(found.map(async (p) => {
        try { return { ...parsePhasePack(JSON.parse(await fetchSource(p.manifest as never)), p.manifest.id), name: p.manifest.name, description: String(p.manifest.description ?? "") }; }
        catch { return null; }
      }))).filter((x): x is NonNullable<typeof x> => !!x);
    })();
  });

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
    if (b.type === "cardio") return cardioPlanned(b) || "Cardio";
    if (b.type === "mobility") return [b.sets ? `${b.sets} × ${b.targetSec ?? 30}${b.metric === "reps" ? "" : " s"}` : "", b.perSide ? "each side" : ""].filter(Boolean).join(" · ");
    if (b.type === "plugin") return b.settingsText ?? (Object.values(b.values ?? {}).filter((v) => v != null && v !== "").slice(0, 3).map((v) => (Array.isArray(v) ? v.join(", ") : String(v))).join(" · ") || "Block from a plugin");
    if (b.type === "circuit") return [`${b.rounds} rounds`, b.members.map((m) => `${m.exerciseName} ${m.durationSec ? P.restText(m.durationSec) : `× ${m.reps ?? ""}`}`).join(", "), b.progression === "add-round" ? "+1 round every 2 weeks" : ""].filter(Boolean).join(" · ");
    return "";
  }
  const labels = $derived(day ? P.supersetLabels(day) : new Map<string, string>());
  // Drag to reorder (canvas PB1): a superset moves as one.
  type Run = { key: string; blocks: ProgramBlock[] };
  const runs = $derived.by(() => {
    const out: Run[] = [];
    for (const b of blocks) {
      const last = out.at(-1);
      if (b.supersetGroup && last?.blocks[0]?.supersetGroup === b.supersetGroup) last.blocks.push(b);
      else out.push({ key: b.supersetGroup ?? b.id, blocks: [b] });
    }
    return out;
  });
  const runOrder = createReorder<string>("y");
  // Exercises in some weeks (canvas PB7).
  let rangeOpen = $state(false);
  let rangeMode = $state<"replace" | "some">("some");
  let rangeBlock = $state<ProgramBlock | null>(null);
  function openRange(b: ProgramBlock, mode: "replace" | "some") { rangeBlock = b; rangeMode = mode; rangeOpen = true; }
  /** "Show: Week 5" reads the day as the client sees it that week; dragging is for all weeks. */
  // Canvas PX1: the weeks being edited (null = every week). The day reads as it is in them.
  let editing = $state<P.WeekRange | null>(null);
  const spanOf = (b: ProgramBlock): P.WeekRange => b.weeks ?? { from: 1, to: prog.weeks.length };
  const inEditing = (b: ProgramBlock) => !editing || (spanOf(b).from <= editing.to && editing.from <= spanOf(b).to);
  const shownRuns = $derived(editing == null ? runs : runs.map((x) => ({ ...x, blocks: x.blocks.filter(inEditing) })).filter((x) => x.blocks.length));
  // Each exercise once (Squat in weeks 1–3 and 5–6 is one row): the part nearest these weeks.
  const notShown = $derived.by(() => {
    if (editing == null) return [];
    const shownNames = new Set(blocks.filter(inEditing).map(blockMain));
    const byName = new Map<string, ProgramBlock>();
    for (const b of blocks) {
      if (inEditing(b) || b.type === "circuit" || shownNames.has(blockMain(b))) continue;
      const cur = byName.get(blockMain(b));
      const gap = (x: ProgramBlock) => Math.min(Math.abs(spanOf(x).to - editing!.from), Math.abs(spanOf(x).from - editing!.to));
      if (!cur || gap(b) < gap(cur)) byName.set(blockMain(b), b);
    }
    return [...byName.values()];
  });
  const editingText = $derived(editing ? P.weekRangeText(editing) : "Every week");
  $effect(() => { if (editing && editing.to > prog.weeks.length) editing = null; });
  const editOptions = $derived([
    { value: "all", label: "Every week", group: "" },
    ...stretches.map((s) => ({ value: `${s.from}-${s.to}`, label: `${P.weekRangeText(s)} · ${stretchTitle(s)}`, group: "Stretches" })),
    ...[...prog.weeks].sort((a, c) => a.weekNumber - c.weekNumber).map((w) => ({ value: `${w.weekNumber}-${w.weekNumber}`, label: `Week ${w.weekNumber}`, group: "One week" })),
  ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i));
  // Canvas PX2: swapping an exercise for the weeks being edited.
  let swapping = $state<ProgramStrength | null>(null);
  let groupOpen = $state(false);
  let groupEditing = $state<string | null>(null);
  let groupDraft = $state<P.GroupDraft | null>(null);
  let groupIsNew = $state(false);
  /** Each member's amount per round, for the dialog: reps, a range (kept), or a time. */
  function amountOf(b: ProgramBlock): { reps?: number; durationSec?: number } {
    if (b.type === "mobility") return b.metric === "reps" ? { reps: b.targetSec } : { durationSec: b.targetSec ?? 30 };
    if (b.type !== "strength") return {};
    const s = b.sets.find((x) => x.setType !== "warmup") ?? b.sets[0];
    if (b.measure === "time" && s?.durationSec) return { durationSec: s.durationSec };
    return s?.reps != null ? { reps: s.reps } : {};
  }
  function openGroup(gid: string, isNew = false) {
    if (!day) return;
    const g = day.groups?.find((x) => x.id === gid);
    groupEditing = gid;
    groupIsNew = isNew;
    groupDraft = {
      kind: g?.kind ?? "superset", name: g?.name, rounds: P.groupRounds(day, gid) || 3,
      memberRestSec: g?.memberRestSec, roundRestSec: g?.roundRestSec, progression: g?.progression ?? "same",
      members: blocks.filter((b) => b.supersetGroup === gid).map((b) => ({ blockId: b.id, exerciseName: blockMain(b), ...amountOf(b) })),
    };
    groupOpen = true;
  }
  function groupActions(gid: string): RowAction[] {
    if (!day) return [];
    const d = day.id;
    return [
      { id: "settings", label: "Edit…", run: () => openGroup(gid) },
      { id: "add", label: "+ Exercise to this group", run: () => { addTo = gid; addOpen = true; } },
      { id: "ungroup", label: "Ungroup", separatorBefore: true, run: () => edit((p, w) => P.ungroup(p, w, d, gid)) },
    ];
  }
  /** "3 rounds · 0:15 between exercises · 1:30 between rounds · same every week" (canvas PB16). */
  function groupSub(gid: string): string {
    const g = day?.groups?.find((x) => x.id === gid);
    const n = day ? P.groupRounds(day, gid) : 0;
    const bits = [`${n} ${n === 1 ? "round" : "rounds"}`];
    bits.push(g?.memberRestSec ? `${P.restText(g.memberRestSec)} between exercises` : g?.kind === "circuit" ? "no rest between exercises" : "back to back");
    if (g?.roundRestSec) bits.push(`${P.restText(g.roundRestSec)} between rounds`);
    bits.push(g?.progression === "add-round" ? "+1 round every 2 weeks" : g?.progression === "each" ? "each exercise's own progression" : "same every week");
    return bits.join(" · ");
  }
  // ── Moving one exercise in, out of and within a group (canvas PB16) ──
  let dragBlock = $state<string | null>(null);
  let dropAt = $state<{ id: string; after: boolean } | null>(null);
  const after = (b: ProgramBlock) => blocks[blocks.indexOf(b) + 1]?.id ?? null;
  function place(id: string, beforeId: string | null, group: string | undefined) {
    if (!day) return;
    const d = day.id;
    edit((p, w) => P.placeBlock(p, w, d, id, beforeId, group));
  }
  /** Alt+arrows on a member: up and down inside its group, and out at either end. */
  function nudgeMember(b: ProgramBlock, dir: -1 | 1) {
    const gid = b.supersetGroup;
    if (!gid) return;
    const m = blocks.filter((x) => x.supersetGroup === gid);
    const k = m.indexOf(b);
    const last = m.at(-1)!;
    if (dir < 0) place(b.id, k > 0 ? m[k - 1]!.id : (m[1]?.id ?? null), k > 0 ? gid : undefined);
    else if (k < m.length - 1) place(b.id, m[k + 2]?.id ?? after(last), gid);
    else place(b.id, after(b), undefined);
  }
  /** Alt+arrows on an exercise on its own next to a group: it joins that group. */
  function joinNext(b: ProgramBlock, dir: -1 | 1): boolean {
    const nb = blocks[blocks.indexOf(b) + dir];
    if (!nb?.supersetGroup || b.type === "circuit" || b.type === "plugin") return false;
    place(b.id, dir > 0 ? nb.id : after(b), nb.supersetGroup);
    return true;
  }
  function dropOn(target: ProgramBlock, e: DragEvent) {
    const id = dragBlock ?? (runOrder.held && blocks.some((x) => x.id === runOrder.held && !x.supersetGroup) ? runOrder.held : null);
    if (!id || id === target.id) return;
    e.preventDefault();
    e.stopPropagation();
    const below = dropAt?.id === target.id && dropAt.after;
    const moving = blocks.find((x) => x.id === id);
    const group = moving && (moving.type === "circuit" || moving.type === "plugin") ? undefined : target.supersetGroup;
    place(id, below ? after(target) : target.id, group);
    dragBlock = null;
    dropAt = null;
    runOrder.end();
  }
  function overBlock(target: ProgramBlock, e: DragEvent) {
    const fromRun = !dragBlock && runOrder.held && blocks.some((x) => x.id === runOrder.held && !x.supersetGroup);
    // A member being dragged, or a lone exercise dragged onto a group's member.
    if (!dragBlock && !(fromRun && target.supersetGroup)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = { id: target.id, after: e.clientY > r.top + r.height / 2 };
  }
  // ── Calculate warm-ups (canvas PB11): the phone's ramp up to the first working set ──
  function calcWarmups(b: ProgramStrength) {
    const work = [...b.sets].filter((s) => s.setType !== "warmup").sort((x, y) => x.orderIndex - y.orderIndex);
    const top = work[0]?.weight;
    if (!top) return;
    const ramp = warmupSets(top).filter((w) => w.weight < top);
    const rest = work[0]?.restSec;
    patchNumbers(b.id, (x) => ({ ...x, sets: [
      ...ramp.map((w, i): ProgramSet => ({ id: createId("pset"), orderIndex: i, setType: "warmup", reps: w.reps, weight: w.weight, ...(rest ? { restSec: 60 } : {}) })),
      ...work.map((s, i) => ({ ...s, orderIndex: ramp.length + i })),
    ] }));
  }
  const MOBILITY_RULES = $derived([
    { value: "", label: "Their own mobility progression" },
    { value: DEFAULT_MOBILITY_ALGORITHM_ID, label: "10 min an area, then longer holds" },
    { value: SAME_EVERY_TIME_ID, label: "Same every time" },
    ...installedPlugins.installed.filter((p) => p.manifest.family === "mobility-progression").map((p) => ({ value: p.manifest.id, label: `${p.manifest.name} (plugin)` })),
  ]);
  function orderRuns(keys: string[]) {
    if (!day) return;
    const byKey = new Map(runs.map((x) => [x.key, x]));
    const ids = keys.flatMap((k) => byKey.get(k)?.blocks.map((b) => b.id) ?? []);
    const d = day.id;
    edit((p) => mapTemplateDay(p, d, (dd) => ({ ...dd, blocks: dd.blocks.map((b) => ({ ...b, orderIndex: ids.indexOf(b.id) })) })));
  }
  function moveRun(from: number, to: number) {
    if (to < 0 || to >= runs.length) return;
    const keys = runs.map((x) => x.key);
    const [k] = keys.splice(from, 1);
    keys.splice(to, 0, k!);
    orderRuns(keys);
  }
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
      <span class="text-muted-foreground">Progression for every exercise</span>
      <b class="font-semibold">{P.ruleLabel(prog.rule)}</b>
      <Button variant="outline" size="sm" onclick={() => { pickingFor = null; picking = true; }}>Change</Button>
    </span>
    <span class="flex items-center gap-2">
      <span class="text-muted-foreground">Length</span>
      <Button variant="outline" size="icon" class="size-7" aria-label="One week fewer" disabled={prog.weeks.length <= 1} onclick={() => setWeeks(prog.weeks.length - 1)}>−</Button>
      <span class="w-16 text-center tabular-nums">{prog.weeks.length} {prog.weeks.length === 1 ? "week" : "weeks"}</span>
      <Button variant="outline" size="icon" class="size-7" aria-label="One week more" disabled={prog.weeks.length >= 52} onclick={() => setWeeks(prog.weeks.length + 1)}>+</Button>
    </span>
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
    <!-- Canvas HT3: who gets how-tos with this program. -->
    <span class="flex items-center gap-2">
      <span class="text-muted-foreground">How-tos</span>
      <OptionSelect size="sm" value={prog.howtoShow ?? "new"} aria-label="How-tos"
        onValueChange={(v) => edit((p) => { const { howtoShow: _h, ...rest } = p; return v === "new" ? rest : { ...rest, howtoShow: v as "always" | "never" }; })}
        options={[{ value: "new", label: "For new lifters" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }]} />
    </span>
    <!-- Canvas PW2: the weeks as one bar of stretches. -->
    <div class="flex min-w-0 basis-full items-center gap-3">
      <div class="min-w-0 flex-1">
        <StretchBar {stretches} total={prog.weeks.length} rule={prog.rule} onopen={openStretch} onedge={moveEdge} selected={editing}
          onpick={(s) => (editing = editing && editing.from === s.from && editing.to === s.to ? null : { from: s.from, to: s.to })} />
      </div>
      <Button variant="outline" size="sm" class="shrink-0" onclick={() => (weeksOpen = true)}>Edit weeks</Button>
    </div>
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

        {#if prog.weeks.length > 1}
          <!-- Canvas PX1: which weeks you're editing; every change below goes to them. -->
          <span class="flex flex-wrap items-center gap-2 text-[13px]"><span class="text-muted-foreground">Editing</span>
            <OptionSelect size="sm" class="min-w-56" value={editing ? `${editing.from}-${editing.to}` : "all"} aria-label="Editing"
              options={editOptions} onValueChange={(v) => { if (v === "all") editing = null; else { const [a, c] = v.split("-").map(Number); editing = { from: a!, to: c! }; } }} />
            <span class="text-xs text-muted-foreground">{editing ? "Changes here apply to these weeks only." : "Changes here apply to every week."}</span>
          </span>
        {/if}
        <ul class="flex flex-col gap-1.5" aria-label="Blocks" ondragenter={(e) => runOrder.allow(e)} ondragover={(e) => runOrder.allow(e)} ondrop={(e) => { const k = runOrder.drop(e); if (k) orderRuns(k); }}>
          {#each editing == null ? runOrder.arrange(runs, (x) => x.key) : shownRuns as run, ri (run.key)}
            <li animate:flip={{ duration: SLIDE_MS }} ondragover={(e) => runOrder.over(run.key, e)}
              class="flex items-start gap-1 rounded-[10px] {runOrder.held === run.key ? 'bg-primary/10 outline-dashed outline-[1.5px] -outline-offset-2 outline-primary [&>*]:invisible' : ''}">
              <button type="button" draggable={editing == null} disabled={editing != null} title={editing ? "Order is the same every week: switch to Every week to move it" : undefined} aria-label="Move {run.blocks.map(blockMain).join(' and ')} (arrow keys)"
                ondragstart={(e) => runOrder.start(runs.map((x) => x.key), run.key, e, (e.currentTarget as HTMLElement).closest("li"))}
                ondragend={() => runOrder.end()}
                onkeydown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  const dir = e.key === "ArrowUp" ? -1 : 1;
                  // Alt+arrow next to a group joins it; plain arrows move past.
                  if (e.altKey && run.blocks.length === 1 && !run.blocks[0]!.supersetGroup && joinNext(run.blocks[0]!, dir)) return;
                  moveRun(ri, ri + dir);
                }}
                class="mt-2 flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-default disabled:opacity-30">
                <GripVerticalIcon class="size-4" />
              </button>
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                {#if run.blocks.length > 1 && run.blocks[0]?.supersetGroup}
                  {@const gid = run.blocks[0].supersetGroup}
                  <ActionMenu actions={groupActions(gid)} label="More for {P.groupLabel(day, gid)}">
                    {#snippet children({ props, more })}
                      {@const g = day.groups?.find((x) => x.id === gid)}
                      <div {...props} class="flex items-center gap-2 rounded-[9px] bg-muted/60 px-3 py-2">
                        <button type="button" onclick={() => openGroup(gid)} class="flex min-w-0 flex-1 flex-col text-left">
                          <span class="truncate text-[13px] font-semibold"><span class="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g?.kind === "circuit" ? "Circuit" : P.groupLabel({ blocks: day.blocks }, gid)}</span>{g?.name ?? ""}</span>
                          <span class="truncate text-xs text-muted-foreground">{groupSub(gid)}</span>
                        </button>
                        <Button variant="outline" size="sm" onclick={() => openGroup(gid)}>Edit…</Button>
                        {@render more()}
                      </div>
                    {/snippet}
                  </ActionMenu>
                {/if}
                {#each run.blocks as b (b.id)}
                  {@const i = blocks.indexOf(b)}
                  {@const grouped = b.supersetGroup && labels.get(b.id)}
                  {@const isOpen = b.id === blockId}
                  {@const circuit = !!grouped && day.groups?.find((x) => x.id === b.supersetGroup)?.kind === "circuit"}
                  <div role="listitem" ondragover={(e) => overBlock(b, e)} ondragleave={() => { if (dropAt?.id === b.id) dropAt = null; }} ondrop={(e) => dropOn(b, e)}
                    class="rounded-[9px] border transition-colors {isOpen ? 'border-primary/60' : 'border-border'} {grouped ? 'border-l-4 border-l-muted-foreground/40' : ''} {dropAt?.id === b.id ? (dropAt.after ? 'shadow-[0_2px_0_0_var(--primary)]' : 'shadow-[0_-2px_0_0_var(--primary)]') : ''}">
                    <ActionMenu actions={blockActions(b, i)} label="More for {blockMain(b)}">
                      {#snippet children({ props, more })}
                        <div {...props} class="flex items-center gap-2 rounded-[9px] px-3 py-2 {isOpen ? 'bg-primary/5' : 'hover:bg-muted/40'}">
                          {#if grouped}
                            <button type="button" draggable={editing == null} disabled={editing != null} aria-label="Move {blockMain(b)} in or out of the group (Alt+arrow keys)"
                              ondragstart={(e) => { e.stopPropagation(); dragBlock = b.id; e.dataTransfer?.setData("text/plain", b.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
                              ondragend={() => { dragBlock = null; dropAt = null; }}
                              onkeydown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); nudgeMember(b, e.key === "ArrowUp" ? -1 : 1); } }}
                              class="-ml-1 flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-30">
                              <GripVerticalIcon class="size-3.5" />
                            </button>
                            <span class="rounded-[5px] bg-muted-foreground px-1.5 text-[11px] font-bold text-background">{labels.get(b.id)}</span>
                          {/if}
                          <button type="button" aria-expanded={isOpen} onclick={() => (blockId = isOpen ? null : b.id)} class="flex min-w-0 flex-1 flex-col text-left">
                            <span class="truncate text-[13px] font-semibold">{#if b.type !== "strength"}<span class="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{b.type === "cardio" ? "Cardio" : b.type === "mobility" ? "Mobility" : b.type === "plugin" ? "Plugin" : b.type === "circuit" ? "Circuit" : ""}</span>{/if}{blockMain(b)}</span>
                            <span class="truncate text-xs text-muted-foreground">{circuit ? `${P.memberAmount(b)} each round` : blockSub(b.type === "strength" && editing ? P.numbersFor(b, editing) : b)}{#if !editing && b.type === "strength" && b.byWeeks?.length}{" · differs by stretch"}{/if}</span>
                          </button>
                          {#if b.weeks}<button type="button" onclick={() => openRange(b, "some")} class="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{P.weekRangeText(b.weeks)}</button>{/if}
                          {@render more()}
                        </div>
                      {/snippet}
                    </ActionMenu>
                    {#if isOpen && block}
                      <!-- The exercise opens in place (canvas PB1). -->
                      <div transition:slide={{ duration: 180 }} class="flex flex-col gap-3.5 border-t border-border px-3.5 py-3.5" aria-label="{blockMain(block)} settings" role="group">

        {#if block.type === "strength"}
          {@const b = editing ? P.numbersFor(block, editing) : block}
          {@const first = b.sets.find((s) => s.setType !== "warmup") ?? b.sets[0]}
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs font-medium text-muted-foreground">Exercise</span>
            <Button variant="ghost" size="sm" onclick={() => (renaming = !renaming)}>Change</Button>
          </div>
          {#if renaming}
            <NamePicker id="rename-ex" label="Change to" placeholder="Search exercises" autofocus search={searchExercises}
              onPick={(n) => { patchBlock(b.id, { exerciseName: n, exerciseId: index?.get(n)?.id } as Partial<ProgramBlock>); renaming = false; }} onCancel={() => (renaming = false)} />
          {/if}
          {#key b.id}
            {@const m = b.measure ?? "weight"}
            {@const rule = P.ruleFor(prog, b, editing?.from)}
            {@const fixed = rule.kind === "fixed"}
            {@const decides = rule.kind === "plugin" && !!rule.decidesSets}
            <!-- Canvas PB11/PB12: the fields that fit. Measures only for ones already set to a
                 hold or distance; Each side only for one-sided lifts. -->
            {#if m !== "weight" || b.perSide || P.isOneSided(b.exerciseName)}
              <div class="grid grid-cols-2 gap-3">
                {#if m !== "weight"}
                  <div class="flex flex-col gap-1.5"><Label>Measures</Label>
                    <OptionSelect size="sm" value={m} aria-label="Measures" options={P.MEASURES.map((x) => ({ value: x.value, label: x.label }))}
                      onValueChange={(v) => patchBlock(b.id, { measure: v === "weight" ? undefined : v } as Partial<ProgramBlock>)} />
                  </div>
                {/if}
                {#if b.perSide || P.isOneSided(b.exerciseName)}
                  <label class="flex items-center justify-between gap-3 self-end pb-1.5 text-[13px]"><span>Each side</span><Switch checked={!!b.perSide} onCheckedChange={(v) => patchBlock(b.id, { perSide: v || undefined } as Partial<ProgramBlock>)} /></label>
                {/if}
              </div>
            {/if}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label>Sets</Label>
                {#if decides}
                  <span class="flex h-9 items-center text-[13px] text-muted-foreground">Decided by {rule.name}</span>
                {:else}
                  <span class="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" class="size-9" aria-label="One set fewer" disabled={b.sets.filter((s) => s.setType !== "warmup").length <= 1} onclick={() => setCount(b, b.sets.length - 1)}>−</Button>
                    <span class="w-6 text-center tabular-nums">{b.sets.filter((s) => s.setType !== "warmup").length}</span>
                    <Button variant="outline" size="icon" class="size-9" aria-label="One set more" onclick={() => setCount(b, b.sets.length + 1)}>+</Button>
                  </span>
                {/if}
              </div>
              {#if m === "time"}
                <div class="flex flex-col gap-1.5"><Label for="ex-hold">Hold</Label><input id="ex-hold" class={fieldCls} value={first?.durationSec ? P.restText(first.durationSec) : ""} placeholder="0:45" onchange={(e) => setAll(b, "hold", e.currentTarget.value, e.currentTarget)} /></div>
              {:else if m === "distance"}
                <div class="flex flex-col gap-1.5"><Label for="ex-dist">Metres</Label><input id="ex-dist" class={fieldCls} inputmode="numeric" value={first?.distanceM ?? ""} placeholder="40" onchange={(e) => setAll(b, "distance", e.currentTarget.value, e.currentTarget)} /></div>
              {:else}
                <div class="flex flex-col gap-1.5"><Label for="ex-reps">{fixed ? "Reps" : "Rep range"}</Label><input id="ex-reps" class={fieldCls} value={first ? P.repsText(first) : ""} placeholder={fixed ? "8" : "8-12"} onchange={(e) => setAll(b, "reps", e.currentTarget.value, e.currentTarget)} /></div>
              {/if}
              {#if fixed && (m === "weight" || m === "added")}
                <div class="flex flex-col gap-1.5"><Label for="ex-load">{m === "added" ? "Added weight" : "Load"}</Label><input id="ex-load" class={fieldCls} value={first ? P.loadText(first) : ""} placeholder={m === "added" ? "10" : "60 or 72%"} onchange={(e) => setAll(b, "load", e.currentTarget.value, e.currentTarget)} /></div>
              {/if}
              <div class="flex flex-col gap-1.5"><Label for="ex-rest">Rest <span class="font-normal text-muted-foreground">blank = theirs</span></Label><input id="ex-rest" class={fieldCls} value={first?.restSec ? P.restText(first.restSec) : ""} placeholder="Their setting" onchange={(e) => setAll(b, "rest", e.currentTarget.value, e.currentTarget)} /></div>
              <div class="{fixed && (m === 'weight' || m === 'added') ? 'col-span-2' : ''} flex flex-col gap-1.5"><Label for="ex-tempo">Tempo <span class="font-normal text-muted-foreground">optional</span></Label><input id="ex-tempo" class={fieldCls} value={first?.tempo ?? ""} placeholder="3-1-1-0" onchange={(e) => setAll(b, "tempo", e.currentTarget.value, e.currentTarget)} /></div>
            </div>
            {#if m === "time" || m === "distance"}
              <p class="text-xs text-muted-foreground">{m === "time" ? "Runs as a timed hold on their phone" : "Logged as distance on their phone"}; progressions leave it as you set it.</p>
            {/if}
            {#if !fixed}
              <!-- Canvas PB12: a progression works out the weights; warm-ups on, off or theirs. -->
              <div class="flex flex-col gap-1.5">
                <Label>Warm-ups</Label>
                <ToggleGroup.Root type="single" variant="outline" spacing={2} class="justify-start" value={b.warmups ?? "theirs"} aria-label="Warm-ups"
                  onValueChange={(v: string) => { if (v) patchNumbers(b.id, (x) => { const { warmups: _w, ...rest } = x; return v === "theirs" ? rest : { ...rest, warmups: v as "on" | "off" }; }); }}>
                  {#each [["on", "On"], ["off", "Off"], ["theirs", "Their choice"]] as [v, l] (v)}
                    <ToggleGroup.Item value={v} class="h-9 rounded-full px-3.5 text-[13px] data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{l}</ToggleGroup.Item>
                  {/each}
                </ToggleGroup.Root>
              </div>
              <p class="text-xs text-muted-foreground">{P.ruleLabel(rule)} picks the weights each workout from these{decides ? ", and how many sets" : ""}. See every week shows them.</p>
            {:else}
              <!-- Canvas PB11: Fixed plans every set. -->
              {@const top = b.sets.filter((s) => s.setType !== "warmup").sort((x, y) => x.orderIndex - y.orderIndex)[0]?.weight}
              <div class="flex flex-col gap-1.5 text-[13px]">
                <div class="flex items-center justify-between gap-2">
                  <Label>Each set</Label>
                  <Button variant="outline" size="sm" disabled={!top} title={top ? undefined : "Needs a kg load on the first working set"} onclick={() => calcWarmups(b)}>Calculate warm-ups</Button>
                </div>
                <table class="w-full text-xs">
                  <thead><tr class="text-left text-muted-foreground"><th class="py-1 font-medium">#</th><th class="font-medium">Type</th><th class="font-medium">Reps</th><th class="font-medium">Load</th><th class="font-medium">Rest</th><th class="font-medium">RPE</th><th></th></tr></thead>
                  <tbody>
                    {#each [...b.sets].sort((x, y) => x.orderIndex - y.orderIndex) as s, k (s.id)}
                      <tr>
                        <td class="py-1 pr-1 text-muted-foreground">{k + 1}</td>
                        <td class="pr-1"><OptionSelect size="sm" value={s.setType} aria-label="Set {k + 1} type" options={setTypes.map((m) => ({ value: m.type, label: m.label }))} onValueChange={(v) => setOne(b, s, "type", v)} /></td>
                        <td class="pr-1"><input class="h-9 w-14 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} reps" value={P.repsText(s)} onchange={(e) => setOne(b, s, "reps", e.currentTarget.value, e.currentTarget)} /></td>
                        <td class="pr-1"><input class="h-9 w-14 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} load" value={P.loadText(s)} onchange={(e) => setOne(b, s, "load", e.currentTarget.value, e.currentTarget)} /></td>
                        <td class="pr-1"><input class="h-9 w-14 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} rest" value={s.restSec ? P.restText(s.restSec) : ""} placeholder="–" onchange={(e) => setOne(b, s, "rest", e.currentTarget.value, e.currentTarget)} /></td>
                        <td class="pr-1"><input class="h-9 w-11 rounded-[7px] border border-input bg-background px-1.5" aria-label="Set {k + 1} RPE" value={s.rpe ?? ""} onchange={(e) => setOne(b, s, "rpe", e.currentTarget.value, e.currentTarget)} /></td>
                        <td><Button variant="ghost" size="icon" class="size-9" aria-label="Remove set {k + 1}" disabled={b.sets.length <= 1} onclick={() => { const d = day!.id; edit((p, w) => P.removeSet(p, w, d, b.id, s.id)); }}>×</Button></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
            <div class="flex items-center justify-between gap-2">
              <span class="flex flex-col"><Label>Progression</Label><span class="text-[13px]">{b.rule ? P.ruleLabel(b.rule) : editing && P.phaseAt(prog, editing.from)?.rule ? `The stretch's · ${P.ruleLabel(rule)}` : `The program's · ${P.ruleLabel(prog.rule)}`}</span></span>
              <Button variant="outline" size="sm" onclick={() => { pickingFor = b; picking = true; }}>Change</Button>
            </div>
            <!-- Canvas PX3: its numbers and progression by stretch; click one to edit it. -->
            {#if prog.weeks.length > 1 && (editing || block.byWeeks?.length)}
              <div class="flex flex-col gap-1 text-[13px]">
                <span class="text-xs text-muted-foreground">{editing ? `These are for ${editingText.toLowerCase()}; other weeks keep theirs.` : "Different in some stretches:"}</span>
                <table class="w-full text-xs">
                  <thead><tr class="text-left text-muted-foreground"><th class="py-1 font-medium">Weeks</th><th class="font-medium">Sets × reps</th><th class="font-medium">Rest</th><th class="font-medium">Progression</th></tr></thead>
                  <tbody>
                    {#each stretches as s (s.key + s.from)}
                      {@const x = P.numbersFor(block, s)}
                      {@const w1 = x.sets.find((y) => y.setType !== "warmup") ?? x.sets[0]}
                      {@const on = !!editing && editing.from === s.from && editing.to === s.to}
                      <tr class="cursor-pointer border-t border-border transition-colors hover:bg-muted/50 {on ? 'bg-muted' : ''}" onclick={() => (editing = { from: s.from, to: s.to })}>
                        <td class="py-1.5 pr-2"><b class="font-semibold">{P.weekRangeText(s).replace(/^Weeks? /, "")}</b>{#if stretchTitle(s) !== P.weekRangeText(s)} <span class="text-muted-foreground">{stretchTitle(s)}</span>{/if}</td>
                        <td class="tabular-nums">{P.strengthSummary(x)}</td>
                        <td class="tabular-nums">{w1?.restSec ? P.restText(w1.restSec) : "–"}</td>
                        <td>{P.ruleLabel(P.ruleFor(prog, x, s.from))}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
            <!-- Canvas PB14: the swaps section follows the swap rule. -->
            {#if swapRule === "list" || b.alternatives?.length}
            <div class="flex flex-col gap-1.5">
              <Label>Swaps they can use</Label>
              <div class="flex flex-wrap gap-1.5">
                {#each b.alternatives ?? [] as a (a.exerciseName)}
                  <span class="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">{a.exerciseName}
                    <button type="button" aria-label="Remove {a.exerciseName}" class="flex size-5 items-center justify-center rounded-full hover:bg-background" onclick={() => edit((p) => P.removeAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, a.exerciseName))}>×</button>
                  </span>
                {:else}
                  <span class="text-xs text-muted-foreground">None yet, so it can't be swapped</span>
                {/each}
              </div>
              {#if addingSwap}
                <NamePicker id="add-swap" label="Swap" placeholder="Search exercises" autofocus search={(q) => searchExercises(q).filter((r) => r.name !== b.exerciseName)}
                  onPick={(n) => { guideSignal("swap.added"); edit((p) => P.addAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, { exerciseName: n, exerciseId: index?.get(n)?.id })); addingSwap = false; }} onCancel={() => (addingSwap = false)} />
              {:else}
                <span class="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onclick={() => (addingSwap = true)}>+ Swap</Button>
                  {#each sameMuscle(b).slice(0, 3) as n (n)}
                    <Button variant="ghost" size="sm" onclick={() => { guideSignal("swap.added"); edit((p) => P.addAlternative(p, { exerciseName: b.exerciseName, exerciseId: b.exerciseId }, { exerciseName: n, exerciseId: index?.get(n)?.id })); }}>+ {n}</Button>
                  {/each}
                </span>
              {/if}
            </div>
            {:else if swapRule === "muscles"}
              {@const same = sameMuscle(b).slice(0, 3)}
              <p class="text-[13px]"><span class="font-medium">Swaps</span> <span class="text-muted-foreground">· Same muscles{same.length ? `: ${same.join(", ")}…` : ""} worked out on their phone</span></p>
            {:else}
              <p class="text-[13px]"><span class="font-medium">Swaps</span> <span class="text-muted-foreground">· Any exercise: your swap rule lets them swap anything</span></p>
            {/if}
          {/key}
        {:else if block.type === "cardio"}
          {@const b = block}
          {#key b.id}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label for="cd-min">Minutes</Label><input id="cd-min" class={fieldCls} inputmode="numeric" value={b.targetDurationSec ? Math.round(b.targetDurationSec / 60) : ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { targetDurationSec: n > 0 ? Math.round(n * 60) : undefined } as Partial<ProgramBlock>); }} /></div>
              <div class="flex flex-col gap-1.5"><Label for="cd-km">Kilometres</Label><input id="cd-km" class={fieldCls} inputmode="decimal" value={b.targetDistanceM ? b.targetDistanceM / 1000 : ""} onchange={(e) => { const n = Number(e.currentTarget.value.replace(",", ".")); patchBlock(b.id, { targetDistanceM: n > 0 ? Math.round(n * 1000) : undefined } as Partial<ProgramBlock>); }} /></div>
            </div>
            <!-- Intervals and effort (canvas PB3); the phone shows them as "Planned". -->
            <label class="flex items-center justify-between gap-3 text-[13px]"><span>Intervals</span><Switch checked={!!b.intervals} onCheckedChange={(v) => patchBlock(b.id, { intervals: v ? { workSec: 60, easySec: 120, repeat: 6 } : undefined } as Partial<ProgramBlock>)} /></label>
            {#if b.intervals}
              {@const iv = b.intervals}
              <div class="grid grid-cols-3 gap-3">
                <div class="flex flex-col gap-1.5"><Label for="cd-work">Work</Label><input id="cd-work" class={fieldCls} value={P.restText(iv.workSec)} placeholder="1:00" onchange={(e) => { const s = P.parseRestText(e.currentTarget.value); if (s) patchBlock(b.id, { intervals: { ...iv, workSec: s } } as Partial<ProgramBlock>); }} /></div>
                <div class="flex flex-col gap-1.5"><Label for="cd-easy">Easy</Label><input id="cd-easy" class={fieldCls} value={iv.easySec ? P.restText(iv.easySec) : ""} placeholder="2:00" onchange={(e) => { const s = P.parseRestText(e.currentTarget.value); if (s !== null) patchBlock(b.id, { intervals: { ...iv, easySec: s } } as Partial<ProgramBlock>); }} /></div>
                <div class="flex flex-col gap-1.5"><Label for="cd-rep">Repeat</Label><input id="cd-rep" class={fieldCls} inputmode="numeric" value={iv.repeat} onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); if (n >= 1 && n <= 50) patchBlock(b.id, { intervals: { ...iv, repeat: n } } as Partial<ProgramBlock>); }} /></div>
              </div>
            {/if}
            <div class="flex flex-col gap-1.5"><Label for="cd-effort">Effort <span class="font-normal text-muted-foreground">optional</span></Label><input id="cd-effort" class={fieldCls} value={b.effort ?? ""} placeholder="Zone 2, or hard, about 8/10" onchange={(e) => patchBlock(b.id, { effort: e.currentTarget.value.trim() || undefined } as Partial<ProgramBlock>)} /></div>
          {/key}
        {:else if block.type === "mobility"}
          {@const b = block}
          {#key b.id}
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5"><Label for="mo-sets">Sets</Label><input id="mo-sets" class={fieldCls} inputmode="numeric" value={b.sets ?? ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { sets: n > 0 ? Math.min(10, Math.round(n)) : undefined } as Partial<ProgramBlock>); }} /></div>
              <div class="col-span-2 flex flex-col gap-1.5"><Label>Measures</Label>
                <OptionSelect size="sm" value={b.metric ?? "hold"} aria-label="Measures" options={[{ value: "hold", label: "Hold" }, { value: "reps", label: "Reps" }]} onValueChange={(v) => patchBlock(b.id, { metric: v } as Partial<ProgramBlock>)} />
              </div>
              <div class="flex flex-col gap-1.5"><Label for="mo-hold">{b.metric === "reps" ? "Reps" : "Hold (seconds)"}</Label><input id="mo-hold" class={fieldCls} inputmode="numeric" value={b.targetSec ?? ""} onchange={(e) => { const n = Number(e.currentTarget.value); patchBlock(b.id, { targetSec: n > 0 ? Math.round(n) : undefined } as Partial<ProgramBlock>); }} /></div>
            </div>
            <label class="flex items-center justify-between gap-3 text-[13px]"><span>Each side</span><Switch checked={!!b.perSide} onCheckedChange={(v) => patchBlock(b.id, { perSide: v } as Partial<ProgramBlock>)} /></label>
            <!-- Canvas PB13: a mobility progression, or theirs. -->
            <div class="flex flex-col gap-1.5"><Label>Progression</Label>
              <OptionSelect size="sm" value={b.progressionId ?? ""} aria-label="Progression" options={MOBILITY_RULES}
                onValueChange={(v) => patchBlock(b.id, { progressionId: v || undefined } as Partial<ProgramBlock>)} />
            </div>
            <p class="text-xs text-muted-foreground">Needs LogIt {P.V2_BLOCKS_APP_VERSION} or newer on their phone.</p>
          {/key}
        {:else if block.type === "circuit"}
          {@const b = block}
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs font-medium text-muted-foreground">{b.rounds} {b.rounds === 1 ? "round" : "rounds"}</span>
            <Button variant="outline" size="sm" onclick={() => openCircuit(b)}>Edit…</Button>
          </div>
          <p class="text-xs text-muted-foreground">Edit turns it into a circuit of its exercises, so each one opens like any other.</p>
          <ul class="flex flex-col gap-1 text-[13px]">
            {#each b.members as m (m.id)}<li class="flex justify-between gap-2"><span>{m.exerciseName}</span><span class="text-muted-foreground">{m.durationSec ? P.restText(m.durationSec) : `${m.reps ?? ""} reps`}</span></li>{/each}
          </ul>
          <p class="text-xs text-muted-foreground">Rest {P.restText(b.memberRestSec ?? 0)} between exercises, {P.restText(b.roundRestSec ?? 0)} between rounds · {b.progression === "add-round" ? "+1 round every 2 weeks" : b.progression === "each" ? "each exercise's own rule" : "same every week"}. Needs LogIt {P.V2_BLOCKS_APP_VERSION} or newer on their phone.</p>
        {:else if block.type === "plugin"}
          {@const b = block}
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs font-medium text-muted-foreground">Plugin block</span>
            <Button variant="outline" size="sm" onclick={() => openPluginBlock(b)}>Edit…</Button>
          </div>
          <p class="text-[13px]">{blockSub(b)}</p>
          <p class="text-xs text-muted-foreground">From a plugin. Clients are asked to allow it; until they do, it's a note in their workout.</p>
        {:else}
          <p class="text-xs text-muted-foreground">{blockSub(block)}</p>
        {/if}
        {#key block.id}
          <div class="flex flex-col gap-1.5">
            <Label for="blk-note">Note for the client</Label>
            <Textarea id="blk-note" rows={2} value={block.note ?? ""} placeholder={block.type === "strength" ? "Pause 1 second on the chest" : "Anything they should know"} onchange={(e) => { const v = e.currentTarget.value.trim() || undefined; patchBlock(block.id, { note: v } as Partial<ProgramBlock>); }} />
          </div>
        {/key}
      
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </li>
          {:else}
            <li class="rounded-[9px] border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">No exercises yet. Add the first one below.</li>
          {/each}
        </ul>
        {#if notShown.length}
          <!-- Exercises that aren't in these weeks, to bring back. -->
          <div class="flex flex-col gap-1.5" aria-label="Not in {editingText.toLowerCase()}">
            <span class="text-xs font-medium text-muted-foreground">Not in {editingText.toLowerCase()}</span>
            {#each notShown as b (b.id)}
              <div class="flex items-center gap-2 rounded-[9px] border border-dashed border-border px-3 py-2 opacity-70">
                <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[13px] font-semibold">{blockMain(b)}</span><span class="text-xs text-muted-foreground">only {P.weekRangeText(spanOf(b)).toLowerCase()}</span></span>
                <Button variant="outline" size="sm" onclick={() => { const d = day!.id, id = b.id, r = editing!; edit((p, w) => P.addToWeeks(p, w, d, id, r, createId("pblock"))); }}>Add to {editingText.toLowerCase()}</Button>
              </div>
            {/each}
          </div>
        {/if}
        <Button variant="outline" class="self-start" onclick={() => (addOpen = true)}>+ Add to {day.name ?? "this day"}{editing ? ` in ${editingText.toLowerCase()}` : ""}</Button>
      </section>
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

<PluginBlockDialog bind:open={pluginOpen} dayName={day?.name || "this day"} editing={editingPlugin} onsave={(b) => putBlock(editingPlugin, b, "plugin")} />

<RulePickerDialog bind:open={picking} current={pickingFor ? (pickingFor.rule ?? null) : (prog.rule ?? null)} exercise={pickingFor?.exerciseName ?? null} onpick={pickRule} />
<StretchDialog bind:open={stretchOpen} program={prog} stretch={stretchEditing} start={stretchStart} packs={phasePacks}
  onsave={(s, replacing) => edit((p) => putStretch(p, s, () => createId("phase"), replacing))}
  onremove={(s) => edit((p) => removeStretch(p, s, () => createId("phase")))} />

<WeeksDialog bind:open={weeksOpen} program={prog} onopen={(s) => openStretch(s)} onadd={() => openStretch(null)} />

<AddToDayDialog bind:open={addOpen} dayName={addTo && day ? `${P.groupLabel(day, addTo)} in ${day.name ?? "this day"}` : (day?.name ?? "this day")} {searchExercises} {searchActivities} {searchDrills} onadd={addPicks} range={editing ? editingText : null} onplugin={() => openPluginBlock(null)} />

{#if swapping && day}
  <!-- Canvas PX2: swap an exercise for the weeks being edited only. -->
  <Dialog.Root open={!!swapping} onOpenChange={(o) => { if (!o) swapping = null; }}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Swap {swapping.exerciseName} in {editingText.toLowerCase()}</Dialog.Title>
        <Dialog.Description>{swapping.exerciseName} stays in the other weeks. The new one takes its place in {editingText.toLowerCase()} with the same sets, rest and progression.</Dialog.Description>
      </Dialog.Header>
      <NamePicker id="swap-weeks" label="Swap for" placeholder="Search exercises" autofocus search={(q) => searchExercises(q).filter((x) => x.name !== swapping?.exerciseName)}
        onPick={(n) => { const d = day!.id, id = swapping!.id, r = editing!; edit((p, w) => P.swapInWeeks(p, w, d, id, r, { exerciseName: n, exerciseId: index?.get(n)?.id }, () => createId("pblock"))); swapping = null; }}
        onCancel={() => (swapping = null)} />
    </Dialog.Content>
  </Dialog.Root>
{/if}

{#if groupDraft && groupEditing && day}
  <GroupDialog bind:open={groupOpen} draft={groupDraft} isNew={groupIsNew} dayName={day.name || "this day"} {index} fallback={P.groupLabel({ blocks: day.blocks }, groupEditing)}
    onsave={(draft) => { const d = day!.id, gid = groupEditing!; edit((p, w) => P.applyGroupDraft(p, w, d, gid, draft, () => createId("pblock"))); }} />
{/if}

{#if rangeBlock && day}
  <WeekRangeDialog bind:open={rangeOpen} mode={rangeMode} name={blockMain(rangeBlock)} weeks={rangeBlock.weeks} total={prog.weeks.length} search={searchExercises}
    onrange={(range) => { const d = day!.id, id = rangeBlock!.id; edit((p, w) => P.setBlockWeeks(p, w, d, id, range)); }}
    onreplace={(from, name) => { const d = day!.id, id = rangeBlock!.id, nid = createId("pblock"); edit((p, w) => P.replaceFromWeek(p, w, d, id, from, { exerciseName: name, exerciseId: index?.get(name)?.id }, nid)); blockId = nid; }} />
{/if}
