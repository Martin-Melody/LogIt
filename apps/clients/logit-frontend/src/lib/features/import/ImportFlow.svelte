<script lang="ts">
  // Import workouts (design canvas I1 bring your history, E1b does this look right?, I2 match
  // your exercises). The file is read on the phone; nothing is saved until "Import".
  // Spreadsheets today; Strong and Hevy join once their real export files are in the tests.
  // Used by Settings › Import workouts and by onboarding ("Pick up where you left off").
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { ArrowLeft, Download, Loader2, Upload } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { onBack } from "$lib/components/sheet/sheet";
  import { chip } from "$lib/components/ui/choice";
  import { toast } from "$lib/components/ui/sonner";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import { pickText } from "$lib/platform/filePick";
  import { takeSharedFile } from "$lib/platform/sharedFile";
  import { saveTextFile } from "$lib/platform/fileSave";
  import { profile } from "$lib/stores/profile.store";
  import { listImports, matchFileExercises, runImport, undoImport, UNDO_DAYS, type ExerciseChoice, type ImportRecord } from "$lib/features/import/imports";
  import { readWorkoutCsv, summariseImport, type ParsedImport, type WeightUnit } from "@logit/core/import/workoutImport";
  import type { ExerciseMatch } from "@logit/core/import/matchExercises";
  import { availableCategories, importData, parseExportFile } from "$lib/usecases/importData";

  let {
    onexit,
    ondone,
    onrestored,
    exitLabel = "Back",
    shared = null,
  }: {
    /** Back from the first screen. */
    onexit: () => void;
    /** After an import that added workouts; without it, this shows its own "imported" screen. */
    ondone?: (record: ImportRecord) => void;
    /** After a LogIt backup file was restored (everything in it), just before the app reloads. */
    onrestored?: () => void;
    exitLabel?: string;
    /** Changes for each file shared to LogIt (Share › LogIt): that file is opened. */
    shared?: string | null;
  } = $props();

  const TEMPLATE = `date,time,workout,exercise,set_type,weight,unit,reps,rpe,seconds,distance_km,notes,workout_notes
2026-11-18,07:30,Upper A,Bench Press,warmup,60,kg,8,,,,,
2026-11-18,07:30,Upper A,Bench Press,,100,kg,5,8,,,paused reps,Felt good
2026-11-18,07:30,Upper A,Pull Up,,,,10,,,,,
2026-11-19,,Lower A,Squat,,140,kg,5,,,,,
2026-11-19,,Lower A,Plank,,,,,,60,,,
2026-11-20,18:00,Cardio,Running,,,,,,1800,5,,
`;

  type Step = "pick" | "check" | "match" | "done";
  let step = $state<Step>("pick");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let fileName = $state("");
  let parsed = $state<ParsedImport | null>(null);
  let matches = $state<ExerciseMatch[]>([]);
  let choices = $state<Record<string, ExerciseChoice>>({});
  let searching = $state<string | null>(null);
  let unit = $state<WeightUnit | null>(null);
  let result = $state<ImportRecord | null>(null);
  let imports = $state<ImportRecord[]>([]);
  let showProblems = $state(false);

  const summary = $derived(parsed ? summariseImport(parsed) : null);
  const unknown = $derived(matches.filter((m) => m.kind === "unknown"));
  const matchedCount = $derived(matches.length - unknown.length);

  onMount(() => (imports = listImports()));

  // Shared from another app (Share › LogIt): straight to the check. Each share has its own
  // link, so a second one while this screen is open is picked up too.
  $effect(() => {
    if (!shared) return;
    void takeSharedFile().then((f) => {
      if (f?.error) error = f.error;
      else if (f?.text != null) void open({ text: f.text, name: f.name });
    });
  });

  // Android back: the previous step, then out.
  $effect(() => onBack(() => {
    if (step === "match") step = "check";
    else if (step === "check") step = "pick";
    else onexit();
  }));

  const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

  async function choose() {
    try {
      await open(await pickText({
        mimeTypes: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain", "application/vnd.ms-excel", "application/json"],
        accept: ".csv,text/csv,text/plain,.json,application/json",
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't read that file.";
      if (msg !== "cancelled") error = msg;
    }
  }

  async function open(file: { text: string; name: string }) {
    error = null;
    busy = true;
    try {
      // A LogIt backup (Settings › Download backup file) restores everything, here too: someone
      // moving phones without an account picks "Import my history" first.
      if (/^\s*\{/.test(file.text)) {
        const data = parseExportFile(file.text);
        await importData(data, availableCategories(data));
        onrestored?.();
        // Every store read the old data at start: start the app again on the restored data.
        window.location.replace("/");
        return;
      }
      const p = readWorkoutCsv(file.text);
      if (p.workouts.length === 0) throw new Error("No workouts found in this file.");
      matches = await matchFileExercises(p);
      // The best guess is picked, so Import straight away is fine.
      choices = Object.fromEntries(matches.filter((m) => m.kind === "unknown").map((m) => [m.name, m.kind === "unknown" && m.suggestion ? { exerciseId: m.suggestion.exerciseId } : "own"]));
      fileName = file.name;
      parsed = p;
      unit = p.unitUnknown ? null : ($profile.weightUnit === "lbs" ? "lb" : "kg");
      step = "check";
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't read that file.";
      step = "pick";
    } finally {
      busy = false;
    }
  }

  async function doImport() {
    if (!parsed || !unit) return;
    busy = true;
    error = null;
    try {
      const record = await runImport($state.snapshot(parsed) as ParsedImport, { fileName, unit, matches: $state.snapshot(matches) as ExerciseMatch[], choices: $state.snapshot(choices) as Record<string, ExerciseChoice> });
      imports = listImports();
      result = record;
      if (ondone && record.added > 0) ondone(record);
      else step = "done";
    } catch (e) {
      error = e instanceof Error ? e.message : "The import didn't finish. Nothing was lost; try again.";
    } finally {
      busy = false;
    }
  }

  async function undo(id: string) {
    busy = true;
    try {
      const n = await undoImport(id);
      toast(`Removed ${n} imported workout${n === 1 ? "" : "s"}`);
      imports = listImports();
      if (result?.id === id) {
        result = null;
        step = "pick";
      }
    } finally {
      busy = false;
    }
  }

  async function downloadTemplate() {
    try {
      await saveTextFile("logit-import-template.csv", TEMPLATE, "text/csv");
      toast("Template saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the template");
    }
  }

  function chooseFor(name: string, choice: ExerciseChoice) {
    choices = { ...choices, [name]: choice };
  }
  function isChoice(name: string, choice: ExerciseChoice): boolean {
    const c = choices[name];
    return choice === "own" ? c === "own" : c !== "own" && c?.exerciseId === choice.exerciseId;
  }
  // Names picked through "Something else…": the exercise's name, to show on its button.
  let pickedNames = $state<Record<string, string>>({});
</script>

<div class="flex flex-1 flex-col gap-4">
  <button type="button" class="flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground"
    onclick={() => (step === "match" ? (step = "check") : step === "check" ? (step = "pick") : onexit())}>
    <ArrowLeft class="h-4 w-4" /> {step === "pick" || step === "done" ? exitLabel : "Back"}
  </button>

  {#if step === "pick"}
    <div class="flex flex-1 flex-col gap-4" in:fade={{ duration: 150 }}>
      <div>
        <h1 class="mb-1 text-[22px] font-bold">Bring your history</h1>
        <p class="text-sm text-muted-foreground">Every workout, set and note comes with you. Nothing is saved until you've checked it.</p>
      </div>
      <div class="flex flex-col gap-2 rounded-xl border border-border p-4">
        <p class="text-[15px] font-semibold">From a spreadsheet</p>
        <p class="text-sm text-muted-foreground">
          One row per set: date, exercise, and reps (or seconds, or distance). Weight, unit, RPE, set type and notes if you have them.
          Save it as CSV from Google Sheets or Excel.
        </p>
        <button type="button" class="flex min-h-11 items-center gap-1.5 self-start rounded-lg border border-border px-3 text-sm font-medium" onclick={() => void downloadTemplate()}>
          <Download class="h-4 w-4" /> Get the template
        </button>
      </div>
      <p class="text-[13px] text-muted-foreground">Export files from Strong and Hevy go straight in, and so does a LogIt backup file.</p>
      {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
      {#if imports.length}
        <div class="flex flex-col gap-1">
          <p class="text-xs font-semibold text-muted-foreground">Recent imports (undo for {UNDO_DAYS} days)</p>
          <ul class="flex flex-col rounded-xl border border-border">
            {#each imports as r, i (r.id)}
              <li class="flex items-center justify-between gap-3 px-3.5 py-2.5 {i ? 'border-t border-border' : ''}">
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium">{r.fileName}</span>
                  <span class="text-xs text-muted-foreground">{r.added} workouts · {day(r.atMs)}</span>
                </span>
                <button type="button" class="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-medium" disabled={busy} onclick={() => void undo(r.id)}>Undo</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <div class="flex-1"></div>
      <button type="button" class="flex h-[52px] items-center justify-center gap-2 rounded-[10px] bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
        disabled={busy} onclick={() => void choose()}>
        {#if busy}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Upload class="h-4 w-4" />{/if} Choose the file
      </button>
      <p class="text-xs text-muted-foreground">The file is read on this phone; it only leaves through your normal sync.</p>
    </div>

  {:else if step === "check" && parsed && summary}
    <div class="flex flex-1 flex-col gap-3.5" in:fade={{ duration: 150 }}>
      <div>
        <p class="mb-1 truncate text-[13px] font-semibold text-muted-foreground">{fileName}</p>
        <h1 class="text-[22px] font-bold">Does this look right?</h1>
        <p class="mt-1 text-sm text-muted-foreground">Nothing is saved until you import.</p>
      </div>
      <dl class="flex flex-col rounded-xl border border-border text-sm">
        <div class="flex justify-between gap-3 border-b border-border px-3.5 py-2.5"><dt class="text-muted-foreground">Workouts</dt><dd class="text-right font-semibold">{summary.workouts} · {day(summary.firstAtMs)} to {day(summary.lastAtMs)}</dd></div>
        <div class="flex justify-between gap-3 border-b border-border px-3.5 py-2.5"><dt class="text-muted-foreground">Sets</dt><dd class="font-semibold tabular-nums">{summary.sets.toLocaleString("en-GB")}</dd></div>
        <div class="flex justify-between gap-3 px-3.5 py-2.5"><dt class="text-muted-foreground">Last workout</dt><dd class="text-right font-semibold">{summary.last?.title ?? "Workout"} · {summary.last?.exercises} exercises</dd></div>
      </dl>
      {#if parsed.slashDates}
        <p class="-mt-1.5 text-xs text-muted-foreground">Dates like 3/4/2026 were read {parsed.slashDates === "day-first" ? "day first (3 April)" : "month first (March 4)"}. Check the first and last dates above.</p>
      {/if}

      {#if parsed.unitUnknown}
        <div class="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <p class="text-sm font-semibold">The file doesn't say which unit</p>
          {#if summary.heaviestUnitless}
            <p class="text-[13px]">Your heaviest {summary.heaviestUnitless.name.toLowerCase()} reads "{summary.heaviestUnitless.weight}". Was that in…</p>
          {/if}
          <div class="grid grid-cols-2 gap-2" role="group" aria-label="Weight unit">
            {#each [["kg", "kg"], ["lb", "lb"]] as [u, label] (u)}
              <button type="button" aria-pressed={unit === u} class={chip(unit === u, "h-10 rounded-lg")} onclick={() => (unit = u as WeightUnit)}>{label}</button>
            {/each}
          </div>
        </div>
      {/if}

      <ul class="flex flex-col rounded-xl border border-border text-sm">
        <li class="flex min-h-11 items-center justify-between gap-3 px-3.5 {unknown.length || summary.setsWithoutWeight ? 'border-b border-border' : ''}">
          <span>{matchedCount} exercise{matchedCount === 1 ? "" : "s"} matched</span><span class="font-semibold text-green-700 dark:text-green-400">✓</span>
        </li>
        {#if unknown.length}
          <li class={summary.setsWithoutWeight ? "border-b border-border" : ""}>
            <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left" onclick={() => (step = "match")}>
              <span>{unknown.length} not recognised, e.g. "{unknown[0]!.name}"</span><span class="shrink-0 text-muted-foreground">Match ›</span>
            </button>
          </li>
        {/if}
        {#if summary.setsWithoutWeight}
          <li class="flex min-h-11 items-center px-3.5 text-muted-foreground">{summary.setsWithoutWeight} set{summary.setsWithoutWeight === 1 ? "" : "s"} with reps and no weight, kept as bodyweight</li>
        {/if}
      </ul>

      {#if parsed.problems.length}
        <div class="flex flex-col gap-1">
          <button type="button" class="flex min-h-11 items-center self-start text-sm text-muted-foreground" onclick={() => (showProblems = !showProblems)}>
            {parsed.problems.length}{parsed.problems.length === 20 ? "+" : ""} row{parsed.problems.length === 1 ? "" : "s"} left out {showProblems ? "▴" : "▾"}
          </button>
          {#if showProblems}
            <ul class="flex flex-col gap-0.5 text-xs text-muted-foreground" transition:fade={{ duration: 120 }}>
              {#each parsed.problems as p (p)}<li>{p}</li>{/each}
            </ul>
          {/if}
        </div>
      {/if}

      <div class="flex-1"></div>
      {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
      <button type="button" class="flex h-[52px] items-center justify-center gap-2 rounded-[10px] bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
        disabled={busy || !unit} onclick={() => void doImport()}>
        {#if busy}<Loader2 class="h-4 w-4 animate-spin" />{/if}
        {unit ? `Import ${summary.workouts} workout${summary.workouts === 1 ? "" : "s"}` : "Pick kg or lb first"}
      </button>
      <p class="text-xs text-muted-foreground">Exercises LogIt doesn't know are kept as your own; nothing is dropped. Importing the same file again adds nothing twice, and you can undo it for {UNDO_DAYS} days.</p>
    </div>

  {:else if step === "match"}
    <div class="flex flex-1 flex-col gap-3" in:fade={{ duration: 150 }}>
      <div>
        <h1 class="text-[22px] font-bold">{unknown.length} exercise{unknown.length === 1 ? "" : "s"} LogIt doesn't know</h1>
        <p class="mt-1 text-sm text-muted-foreground">Match each to one of ours, or keep it as your own. Nothing is dropped either way.</p>
      </div>
      {#each [...unknown].sort((a, b) => (summary?.exercises.find((e) => e.name === b.name)?.sets ?? 0) - (summary?.exercises.find((e) => e.name === a.name)?.sets ?? 0)) as m (m.name)}
        {@const sets = summary?.exercises.find((e) => e.name === m.name)?.sets ?? 0}
        {@const c = choices[m.name]}
        <div class="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
          <div class="flex items-baseline justify-between gap-2"><span class="text-[15px] font-semibold">{m.name}</span><span class="shrink-0 text-xs text-muted-foreground">{sets} set{sets === 1 ? "" : "s"}</span></div>
          <div class="grid grid-cols-2 gap-2">
            {#if m.kind === "unknown" && m.suggestion}
              {@const sug = m.suggestion}
              <button type="button" aria-pressed={isChoice(m.name, { exerciseId: sug.exerciseId })} class={chip(isChoice(m.name, { exerciseId: sug.exerciseId }), "h-auto min-h-11 whitespace-normal rounded-lg px-2 py-1.5 text-[13px]")}
                onclick={() => chooseFor(m.name, { exerciseId: sug.exerciseId })}>{sug.libraryName}</button>
            {:else if c && c !== "own" && pickedNames[m.name]}
              <button type="button" aria-pressed="true" class={chip(true, "h-auto min-h-11 whitespace-normal rounded-lg px-2 py-1.5 text-[13px]")}>{pickedNames[m.name]}</button>
            {:else}
              <button type="button" class={chip(false, "h-auto min-h-11 whitespace-normal rounded-lg px-2 py-1.5 text-[13px]")} onclick={() => (searching = m.name)}>Pick one of ours…</button>
            {/if}
            <button type="button" aria-pressed={c === "own"} class={chip(c === "own", "h-auto min-h-11 rounded-lg px-2 py-1.5 text-[13px]")} onclick={() => chooseFor(m.name, "own")}>Keep as my own</button>
          </div>
          {#if searching === m.name}
            <div transition:fade={{ duration: 120 }}>
              <ExerciseSearchInput placeholder="Search the library" onConfirm={(sel) => {
                searching = null;
                if (sel.exerciseId) { chooseFor(m.name, { exerciseId: sel.exerciseId }); pickedNames = { ...pickedNames, [m.name]: sel.name }; }
              }} />
            </div>
          {:else if m.kind === "unknown" && m.suggestion}
            <button type="button" class="min-h-9 self-start rounded-lg border border-border px-3 text-[13px] font-medium" onclick={() => (searching = m.name)}>Something else…</button>
          {:else if c === "own"}
            <span class="text-xs text-muted-foreground">No close match. Kept as your own; LogIt asks for its muscles the first time you do it.</span>
          {/if}
        </div>
      {/each}
      <div class="flex-1"></div>
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-base font-semibold text-primary-foreground" onclick={() => (step = "check")}>Done</button>
    </div>

  {:else if step === "done" && result}
    <div class="flex flex-1 flex-col gap-4" in:fade={{ duration: 150 }}>
      <div>
        <h1 class="mb-1 text-[22px] font-bold">{result.added ? `${result.added} workout${result.added === 1 ? "" : "s"} imported` : "Nothing new to import"}</h1>
        <p class="text-sm text-muted-foreground">
          {#if summary && summary.workouts > result.added}{summary.workouts - result.added} {summary.workouts - result.added === 1 ? "was" : "were"} already here, so {summary.workouts - result.added === 1 ? "it wasn't" : "they weren't"} added again. {/if}
          {#if result.added}Your history, charts and estimated maxes now include them.{/if}
        </p>
      </div>
      <div class="flex-1"></div>
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-base font-semibold text-primary-foreground" onclick={() => void goto("/sessions")}>See your workouts</button>
      {#if result.added}
        <button type="button" class="h-11 rounded-[10px] border border-border text-sm font-medium" disabled={busy} onclick={() => void undo(result!.id)}>Undo this import</button>
      {/if}
    </div>
  {/if}
</div>
