<!-- One exercise in three tabs (design canvas E1–E3): Progress · How to · Settings. Read first,
     change second, danger last. The same view opens as a sheet from a workout (tap the name)
     and as a page from the Exercises list. Machines aren't kept here: "Where you do it" shows
     the machine used at each place (they live in places, Martin 2026-11-18). -->
<script lang="ts" module>
  export type ExerciseTab = "progress" | "howto" | "settings";
</script>

<script lang="ts">
  import VideoEmbed from "./VideoEmbed.svelte";
  import { Copy, Package, RotateCcw, Trash2, ChevronRight } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ExerciseProgressionPanel from "./ExerciseProgressionPanel.svelte";
  import ExerciseProgressionSettingsPanel from "./ExerciseProgressionSettingsPanel.svelte";
  import CuesEditor from "$lib/features/library/CuesEditor.svelte";
  import MusclePicker from "$lib/features/library/MusclePicker.svelte";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { getExerciseRepo, getLibraryRepo } from "$lib/data/repoProvider";
  import { updateExercise } from "$lib/usecases/updateExercise";
  import { pushDeletedExercise, pushExercise } from "$lib/sync/syncService";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { exportExercisesAsPack, isUserExercise } from "$lib/plugins";
  import { profile } from "$lib/stores/profile.store";
  import { reveal, popIn } from "$lib/transitions";
  import { EQUIPMENT, usesBodyweightLoad, type Equipment, type Exercise, type ExercisePatch, type ExerciseType, type MuscleGroup } from "@logit/core/domain/exercise";
  import { EQUIPMENT_LABEL, cleanCues, copyLibraryItem, type CoachRef } from "@logit/core/domain/library";
  import { barbellFor, chosenMachine, dumbbellWeightsKg, machinesFor, usesMachine, type Place, type PlaceMachine } from "@logit/core/domain/place";
  import { formatLoad } from "@logit/core/domain/units";
  import type { ExerciseHistoryEntry } from "@logit/core/domain/progression";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getExerciseStats, type ExerciseStats } from "@logit/core/usecases/progression/getExerciseStats";
  import { resetExerciseProgression } from "@logit/core/usecases/progression/resetExerciseProgression";

  let {
    exerciseId,
    tab = $bindable("auto"),
    today,
    excludeSessionId,
    onExercise = () => {},
    onDeleted = () => {},
    onMachine,
  }: {
    exerciseId: string;
    /** "auto": How to the first time (no history), else Progress. */
    tab?: ExerciseTab | "auto";
    /** From a workout: today's target, shown at the top of Progress. */
    today?: Snippet;
    /** The workout being logged, so it doesn't count as history. */
    excludeSessionId?: string;
    /** Reports the loaded exercise (or null) so the host can show its name. */
    onExercise?: (ex: Exercise | null) => void;
    /** Called after the exercise is deleted: the host closes or goes back. */
    onDeleted?: () => void;
    /** A "Where you do it" row: open that machine (or add one, machineId null). Default: Settings. */
    onMachine?: (place: Place | null, machineId: string | null) => void;
  } = $props();

  let exercise = $state<Exercise | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let stats = $state<ExerciseStats | null>(null);
  let history = $state<ExerciseHistoryEntry[]>([]);
  let fromCoach = $state<CoachRef | null>(null);

  let draftName = $state("");
  let draftNotes = $state("");
  let draftCues = $state<string[]>([]);

  const editable = $derived(!!exercise && !exercise.isCore && !fromCoach && !exercise.id.startsWith("pack:"));
  const shown = $derived<ExerciseTab>(tab === "auto" ? (loading || history.length ? "progress" : "howto") : tab);
  const unit = $derived($profile.weightUnit);
  const bodyweight = $derived(usesBodyweightLoad(exercise?.exerciseType, []));

  async function load(id: string) {
    loading = true;
    error = null;
    try {
      const ex = await getExerciseRepo().getById(id);
      exercise = ex;
      fromCoach = null;
      if (ex) {
        draftName = ex.name;
        draftNotes = ex.notes ?? "";
        draftCues = [...(ex.cues ?? [])];
        if (!ex.isCore) {
          const own = await getExerciseRepo().list({ filter: "mine", limit: 5000 });
          if (!own.some((e) => e.id === ex.id)) {
            const shared = (await getLibraryRepo().listFromCoaches()).find((i) => i.kind === "strength" && i.item.id === ex.id);
            fromCoach = shared?.coach ?? null;
          }
        }
        const deps = getProgressionDeps();
        const [s, h] = await Promise.all([
          getExerciseStats({ id: ex.id, name: ex.name }, deps).catch(() => null),
          getExerciseHistory({ id: ex.id, name: ex.name }, deps, { excludeSessionId }).then((r) => r.history).catch(() => []),
        ]);
        stats = s;
        history = h;
      }
      onExercise(ex);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load the exercise";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(exerciseId);
  });

  async function saveField(patch: ExercisePatch) {
    if (!exercise) return;
    await updateExercise(exercise.id, patch);
    exercise = { ...exercise, ...patch };
    onExercise(exercise);
  }

  function commitName() {
    const trimmed = draftName.trim();
    if (!exercise || !trimmed) { draftName = exercise?.name ?? ""; return; }
    if (trimmed !== exercise.name) void saveField({ name: trimmed });
  }

  let draftVideo = $state("");
  $effect(() => { draftVideo = exercise?.videoUrl ?? ""; });
  function commitVideo() {
    const v = draftVideo.trim() || undefined;
    if (exercise && v !== exercise.videoUrl) void saveField({ videoUrl: v });
  }

  function commitNotes() {
    const trimmed = draftNotes.trim() || null;
    if (exercise && trimmed !== (exercise.notes ?? null)) void saveField({ notes: trimmed });
  }

  let cuesTimer: ReturnType<typeof setTimeout> | null = null;
  function onCuesChange(next: string[]) {
    draftCues = next;
    if (cuesTimer) clearTimeout(cuesTimer);
    cuesTimer = setTimeout(() => void saveField({ cues: cleanCues(draftCues) }), 600);
  }

  async function makeOwnCopy() {
    if (!exercise) return;
    const repo = getExerciseRepo();
    let name = exercise.name;
    for (let n = 2; await repo.getByName(name); n++) name = `${exercise.name} (${n})`;
    const copy = copyLibraryItem({ kind: "strength", item: exercise }, name);
    if (copy.kind !== "strength") return;
    await repo.saveExercise(copy.item);
    pushExercise(copy.item);
    void goto(`/exercises/${encodeURIComponent(copy.item.id)}`);
  }

  let deleting = $state(false);
  async function doDelete() {
    if (!exercise) return;
    deleting = true;
    try {
      await getExerciseRepo().remove(exercise.id);
      pushDeletedExercise(exercise.id);
      onDeleted();
    } finally {
      deleting = false;
    }
  }

  let resetting = $state(false);
  let resetDone = $state(false);
  async function doReset() {
    if (!exercise) return;
    resetting = true;
    try {
      await resetExerciseProgression({ id: exercise.id, name: exercise.name }, getProgressionDeps());
      resetDone = true;
    } finally {
      resetting = false;
    }
  }

  let exportOpen = $state(false);
  let exportName = $state("");
  let exporting = $state(false);
  let exportError = $state<string | null>(null);
  async function doExport() {
    if (!exercise || !exportName.trim() || exporting) return;
    exporting = true;
    exportError = null;
    try {
      await exportExercisesAsPack(exportName, [exercise]);
      exportOpen = false;
    } catch (e) {
      exportError = e instanceof Error ? e.message : "Couldn't build the pack.";
    } finally {
      exporting = false;
    }
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  const machineById = $derived(
    new Map(placesStore.all.flatMap((p) => p.machines.map((m) => [m.id, { place: p, machine: m }] as const))),
  );
  const recent = $derived(
    [...history].reverse().slice(0, 12).map((h) => {
      const working = h.sets.filter((s) => s.setType !== "warmup" && s.reps > 0);
      const sets = working.length ? working : h.sets;
      const same = sets.every((s) => Math.abs(s.weight - sets[0]!.weight) < 0.01);
      const text = same && sets.length
        ? `${formatLoad(sets[0]!.weight, unit, bodyweight, { withUnit: false })} × ${sets.map((s) => s.reps).join(", ")}`
        : sets.map((s) => `${formatLoad(s.weight, unit, bodyweight, { withUnit: false })} × ${s.reps}`).join(" · ");
      const mId = sets.find((s) => s.machineId)?.machineId;
      const at = mId ? machineById.get(mId) : undefined;
      return { id: h.sessionId, when: h.performedAtMs, text, where: at ? `${at.place.name} · ${at.machine.name}` : "" };
    }),
  );
  const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  // ── How to ────────────────────────────────────────────────────────────────
  const label = (m: MuscleGroup | string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");
  const places = $derived(placesStore.active);

  function machineLine(m: PlaceMachine): string {
    const u = m.unit === "lbs" ? "lb" : "kg";
    if (m.weights?.kind === "stack" && m.weights.values.length) return `${m.name} · stack ${m.weights.values[0]}–${m.weights.values.at(-1)} ${u}`;
    if (m.weights?.kind === "linear") return `${m.name} · stack ${m.weights.min}–${m.weights.max ?? "?"} ${u}`;
    return m.loading === "plates" ? `${m.name} · plates` : m.name;
  }

  /** For free weights: what the weight comes from at that place (no machine to pick). */
  function freeWeightLine(p: Place, e: Exercise): string | null {
    const range = (xs: number[]) => (xs.length ? `${xs[0]}–${xs.at(-1)} kg` : "");
    switch (e.equipment) {
      case "barbell": {
        const bar = barbellFor(p, e.name);
        return bar ? `${bar.barKg} kg bar and plates` : "No barbell here";
      }
      case "dumbbell": {
        const d = dumbbellWeightsKg(p.dumbbells);
        return d.length ? `Dumbbells ${range(d)}` : "No dumbbells here";
      }
      case "kettlebell":
        return p.kettlebellsKg?.length ? `Kettlebells ${range([...p.kettlebellsKg].sort((a, b) => a - b))}` : "No kettlebells here";
      default:
        return null;
    }
  }
  const showWhere = $derived(!!exercise && (usesMachine(exercise.equipment) || ["barbell", "dumbbell", "kettlebell"].includes(exercise.equipment ?? "")));

  function openMachine(p: Place, machineId: string | null) {
    if (onMachine) onMachine(p, machineId);
    else void goto(`/settings/places/${p.id}/machine/${machineId ?? "new"}`);
  }

  const TYPES: [ExerciseType, string, string][] = [
    ["normal", "What you lift", ""],
    ["assisted", "The help", "assisted"],
    ["bodyweight", "Added to", "bodyweight"],
  ];
</script>

{#snippet equipmentField(ex: Exercise)}
  <label class="flex flex-col gap-1 text-sm font-medium">Equipment
    <select value={ex.equipment ?? ""} onchange={(e) => void saveField({ equipment: ((e.currentTarget as HTMLSelectElement).value || undefined) as Equipment | undefined })}
      class="h-10 rounded-md border bg-background px-3 text-sm font-normal">
      <option value="">Not set</option>
      {#each EQUIPMENT as eq (eq)}<option value={eq}>{label(EQUIPMENT_LABEL[eq])}</option>{/each}
    </select>
  </label>
{/snippet}

{#if error}
  <p class="px-4 py-2 text-sm text-destructive">{error}</p>
{/if}

{#if loading && !exercise}
  <p class="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
{:else if !exercise}
  <p class="px-4 py-6 text-sm text-muted-foreground">Exercise not found.</p>
{:else}
  {@const ex = exercise}
  <div role="tablist" aria-label="{ex.name}" class="sticky top-0 z-10 flex border-b border-border bg-background px-4">
    {#each [["progress", "Progress"], ["howto", "How to"], ["settings", "Settings"]] as [id, name] (id)}
      <button type="button" role="tab" aria-selected={shown === id} data-testid="exercise-tab-{id}"
        class="min-h-11 flex-1 border-b-2 text-sm {shown === id ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground'}"
        onclick={() => (tab = id as ExerciseTab)}>{name}</button>
    {/each}
  </div>

  {#key shown}
  <div class="flex flex-col gap-5 px-4 py-4" role="tabpanel" in:popIn={{ duration: 180, y: 6 }}>
    {#if shown === "progress"}
      {@render today?.()}
      <ExerciseProgressionPanel exercise={{ id: ex.id, name: ex.name }} showMetrics={false} />
      {#if stats && stats.totalSessions > 0}
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {#if stats.bestSet}<dt class="text-muted-foreground">Best set</dt><dd class="font-semibold tabular-nums">{formatLoad(stats.bestSet.weight, unit, bodyweight)} × {stats.bestSet.reps}</dd>{/if}
          {#if stats.bestEstimated1RM && !bodyweight}<dt class="text-muted-foreground">Estimated max</dt><dd class="font-semibold tabular-nums">{formatLoad(stats.bestEstimated1RM, unit, false)} for one rep</dd>{/if}
          <dt class="text-muted-foreground">Done</dt><dd class="font-semibold">{stats.totalSessions} {stats.totalSessions === 1 ? "workout" : "workouts"}</dd>
        </dl>
      {/if}
      {#if recent.length}
        <section class="flex flex-col" aria-label="History">
          <h3 class="pb-1 text-[15px] font-semibold">History</h3>
          {#each recent as r (r.id)}
            <a href="/sessions/{r.id}" class="flex flex-col gap-0.5 border-t border-border/60 py-2.5">
              <span class="flex justify-between gap-2 text-[13px] text-muted-foreground"><span>{date(r.when)}</span><span class="truncate">{r.where}</span></span>
              <span class="text-[15px] font-medium tabular-nums">{r.text}</span>
            </a>
          {/each}
        </section>
      {:else}
        <p class="text-sm text-muted-foreground">Nothing logged yet. Your sets show here after the first workout with it.</p>
      {/if}

    {:else if shown === "howto"}
      <!-- First on the tab: in a workout this is where you add the machine (Martin 2026-11-23). -->
      {#if showWhere && (places.length || usesMachine(ex.equipment))}
        <section class="flex flex-col" aria-label="Where you do it">
          <h3 class="pb-1 text-[15px] font-semibold">Where you do it</h3>
          {#if !places.length}
            <!-- No place yet: the first machine makes "My gym", like the card's chip. -->
            <button type="button" class="flex min-h-14 items-center justify-between gap-2 border-t border-border/60 py-2 text-left"
              onclick={() => (onMachine ? onMachine(null, null) : void goto("/settings/places"))}>
              <span class="text-[15px] font-medium">Add the machine you use</span>
              <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          {/if}
          {#each places as p (p.id)}
            {#if usesMachine(ex.equipment)}
              {@const here = machinesFor(p, ex.id)}
              {@const m = chosenMachine(p, ex.id) ?? here[0] ?? null}
              <button type="button" class="flex min-h-14 items-center justify-between gap-2 border-t border-border/60 py-2 text-left"
                onclick={() => openMachine(p, m?.id ?? null)}>
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-[15px] font-medium">{p.name}</span>
                  <span class="text-[13px] text-muted-foreground">{m ? machineLine(m) : "No machine for this yet. Add one"}</span>
                </span>
                <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            {:else if onMachine}
              <!-- In a workout: shown, not opened (the place's settings are a page). -->
              <div class="flex min-h-14 flex-col justify-center gap-0.5 border-t border-border/60 py-2">
                <span class="text-[15px] font-medium">{p.name}</span>
                <span class="text-[13px] text-muted-foreground">{freeWeightLine(p, ex)}</span>
              </div>
            {:else}
              <a href="/settings/places/{p.id}" class="flex min-h-14 items-center justify-between gap-2 border-t border-border/60 py-2">
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-[15px] font-medium">{p.name}</span>
                  <span class="text-[13px] text-muted-foreground">{freeWeightLine(p, ex)}</span>
                </span>
                <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            {/if}
          {/each}
        </section>
      {/if}

      {#if ex.primaryMuscles.length || ex.secondaryMuscles.length}
        <section class="flex flex-col gap-2" aria-label="Works">
          <h3 class="text-[15px] font-semibold">Works</h3>
          <div class="flex flex-wrap gap-1.5">
            {#each ex.primaryMuscles as m (m)}<span class="rounded-full bg-primary px-2.5 py-1 text-[13px] font-medium text-primary-foreground">{label(m)}</span>{/each}
            {#each ex.secondaryMuscles as m (m)}<span class="rounded-full bg-muted px-2.5 py-1 text-[13px]">{label(m)}</span>{/each}
          </div>
        </section>
      {/if}

      {#if ex.videoUrl}
        <VideoEmbed url={ex.videoUrl} title="{ex.name}, how it's done" />
      {/if}
      <section class="flex flex-col gap-2" aria-label="How to do it">
        <h3 class="text-[15px] font-semibold">How to do it</h3>
        {#if editable}
          <CuesEditor cues={draftCues} onChange={onCuesChange} idPrefix="ex-cue" />
        {:else if ex.cues?.length}
          <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {#each ex.cues as cue, i (i)}<li>{cue}</li>{/each}
          </ol>
        {:else}
          <p class="text-sm text-muted-foreground">No steps written for this one yet.</p>
        {/if}
      </section>

      {#if editable}
        <section class="flex flex-col gap-2">
          <label for="ex-video" class="text-[15px] font-semibold">Video</label>
          <input id="ex-video" type="url" inputmode="url" bind:value={draftVideo} onblur={commitVideo} placeholder="A YouTube link"
            class="h-11 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </section>
      {/if}

      <section class="flex flex-col gap-2">
        <label for="ex-notes" class="text-[15px] font-semibold">Your notes</label>
        <textarea id="ex-notes" rows="2" bind:value={draftNotes} onblur={commitNotes} placeholder="Seat height, grip, anything to remember"
          class="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
      </section>

    {:else}
      <!-- How it goes up: the panel carries its own heading. -->
      {#key ex.id}<ExerciseProgressionSettingsPanel exercise={ex} />{/key}

      <section class="flex flex-col gap-2">
        <h3 class="text-[13px] font-semibold text-muted-foreground">The weight you log is</h3>
        <div role="group" aria-label="The weight you log is" class="grid grid-cols-3 gap-1.5">
          {#each TYPES as [type, line1, line2] (type)}
            {@const on = (ex.exerciseType ?? "normal") === type}
            <button type="button" aria-pressed={on} onclick={() => { if (!on) void saveField({ exerciseType: type }); }}
              class="flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-1 text-[13px] leading-tight {on ? 'border-2 border-foreground font-semibold' : 'border-border'}">
              <span>{line1}</span>{#if line2}<span class={on ? "" : "text-muted-foreground"}>{line2 === "assisted" ? "(assisted)" : "bodyweight"}</span>{/if}
            </button>
          {/each}
        </div>
        {#if (ex.exerciseType ?? "normal") === "assisted"}
          <p class="text-xs text-muted-foreground" transition:reveal>Log how much the machine helps. Less help is progress.</p>
        {:else if ex.exerciseType === "bodyweight"}
          <p class="text-xs text-muted-foreground" transition:reveal>0 is bodyweight alone; 10 is a 10 {unit === "lbs" ? "lb" : "kg"} vest or belt on top.</p>
        {/if}
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="text-[13px] font-semibold text-muted-foreground">Details</h3>
        {#if editable}
          <label class="flex flex-col gap-1 text-sm font-medium">Name
            <input bind:value={draftName} onblur={commitName} class="h-10 rounded-md border bg-background px-3 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-ring" />
          </label>
          {@render equipmentField(ex)}
          <div class="flex flex-col gap-1 text-sm font-medium">Muscles
            <MusclePicker primary={ex.primaryMuscles} secondary={ex.secondaryMuscles} onChange={(m: { primary: MuscleGroup[]; secondary: MuscleGroup[] }) => void saveField({ primaryMuscles: m.primary, secondaryMuscles: m.secondary })} />
          </div>
        {:else}
          <p class="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-snug">
            {fromCoach ? `From ${fromCoach.coachName}, who keeps it up to date.` : "Built into LogIt, so the name, muscles and how-to stay as they are."}
            Make your own copy to change them.
          </p>
          <Button variant="outline" class="h-11 self-start" onclick={() => void makeOwnCopy()}><Copy class="h-4 w-4" /> Make my own copy</Button>
          <!-- What your gym has (a T-bar row on a plate-loaded machine, Martin 24 Nov) is yours to set, and keeps the history. -->
          {#if !fromCoach}{@render equipmentField(ex)}{/if}
        {/if}
      </section>

      <section class="flex flex-col gap-2">
        {#if isUserExercise(ex)}
          {#if exportOpen}
            <div class="flex flex-col gap-2 rounded-lg border border-border p-3" transition:reveal>
              <p class="text-xs text-muted-foreground">Saves it as a <code>.logit-pack.json</code> file. Anyone can install it from Plugins › Add › File.</p>
              <input bind:value={exportName} placeholder="Pack name" aria-label="Pack name" class="h-10 rounded-md border bg-background px-3 text-sm" />
              {#if exportError}<p class="text-xs text-destructive">{exportError}</p>{/if}
              <div class="flex gap-2">
                <Button size="sm" disabled={!exportName.trim() || exporting} onclick={() => void doExport()}>{exporting ? "Saving…" : "Download"}</Button>
                <Button size="sm" variant="outline" onclick={() => (exportOpen = false)}>Cancel</Button>
              </div>
            </div>
          {:else}
            <Button variant="outline" class="h-11 w-full justify-start" onclick={() => { exportName = `${ex.name} pack`; exportOpen = true; }}>
              <Package class="h-4 w-4" /> Share as a pack
            </Button>
          {/if}
        {/if}
        <ConfirmDialog
          title="Start progression over?"
          description="LogIt forgets where this exercise's plan had got to and works it out again next time. Your history stays."
          confirmLabel="Start over"
          saving={resetting}
          onConfirm={doReset}
        >
          {#snippet child({ props })}
            <Button {...props} variant="outline" class="h-auto min-h-12 w-full flex-col items-start gap-0.5 py-2 text-left">
              <span class="flex items-center gap-2"><RotateCcw class="h-4 w-4" /> Start progression over</span>
              <span class="pl-6 text-xs font-normal text-muted-foreground">{resetDone ? "Done. The next workout plans it afresh." : "Your history stays. Asks first."}</span>
            </Button>
          {/snippet}
        </ConfirmDialog>
        {#if editable}
          <ConfirmDialog
            title={`Delete "${ex.name}"?`}
            description="Removes the exercise. Workouts you've logged with it keep their sets."
            confirmLabel="Delete"
            saving={deleting}
            onConfirm={doDelete}
          >
            {#snippet child({ props })}
              <Button {...props} variant="outline" aria-label="Delete exercise" class="h-11 w-full justify-start border-destructive/50 text-destructive">
                <Trash2 class="h-4 w-4" /> Delete exercise
              </Button>
            {/snippet}
          </ConfirmDialog>
        {/if}
      </section>
    {/if}
  </div>
  {/key}
{/if}
