<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  // Add or change a machine at a place (design canvas X6 then X7, M2). Asks what people can see
  // on the machine: how the weight goes on, then the numbers on the stack, in runs, because many
  // stacks go up 5 kg at a time for the first plates and 10 kg after (Martin). Anything odder is
  // typed exactly as printed. A machine serves every exercise done on it.
  //
  // Used by Settings › Your places and, as a sheet, from a workout (M1/M2): there the place and
  // the exercise are filled in, and with no place yet the first machine makes "My gym" (M3).
  import { onMount, untrack } from "svelte";
  import { ArrowLeft, Plus, Search, X } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { fade } from "svelte/transition";
  import { reveal, popIn } from "$lib/transitions";
  import { onBack as onBackKey } from "$lib/components/sheet/sheet";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { createId } from "@logit/core/domain/ids";
  import { fromDisplayWeight } from "@logit/core/domain/units";
  import type { Exercise } from "@logit/core/domain/exercise";
  import {
    runsFromStack, stackFromRuns, usesMachine,
    type ExtraLoad, type MachineLoading, type MachineStatus, type Place, type PlaceMachine, type StackRun,
  } from "@logit/core/domain/place";

  let {
    place,
    machineId = null,
    forExercise = null,
    backLabel = "Back",
    onDone,
    onBack,
  }: {
    /** Null: no place yet; saving makes one (the usual place, else a new My gym). */
    place: Place | null;
    /** An existing machine to change; null adds one. */
    machineId?: string | null;
    /** Adding from a workout: this exercise is ticked, its name suggested, and the machine is picked for it. */
    forExercise?: { id: string; name: string } | null;
    backLabel?: string;
    onDone: (result: { machine: PlaceMachine; place: Place; createdPlace: boolean }) => void;
    onBack: () => void;
  } = $props();

  const existing = $derived(place?.machines.find((m) => m.id === machineId) ?? null);

  let step = $state<1 | 2>(1);
  let name = $state(untrack(() => forExercise?.name ?? ""));
  let loading = $state<MachineLoading>("stack");
  let unit = $state<"kg" | "lbs">("kg");
  let start = $state(5);
  let runs = $state<StackRun[]>([{ step: 5, to: 100 }]);
  let exact = $state<string | null>(null);
  let addOns = $state<number[]>([]);
  let pin = $state(get(kit).includes("pin"));
  let noExtra = $state(false);
  let emptyKg = $state<number | null>(null);
  let status = $state<MachineStatus>("in");
  let exerciseIds = $state<string[]>(untrack(() => (forExercise ? [forExercise.id] : [])));
  let exercises = $state<Exercise[]>([]);
  let search = $state("");
  let loaded = false;

  onMount(async () => {
    try {
      // Only exercises a machine can decide the number for: machine, cable and Smith work (and
      // ones with no equipment set). Bench press, dumbbell and bodyweight work never use one.
      const all = (await getExerciseRepo().list({ filter: "all", limit: 5000 }))
        .filter((e) => !e.exerciseType || e.exerciseType === "normal" || e.exerciseType === "assisted")
        .filter((e) => usesMachine(e.equipment) || e.exerciseType === "assisted" || untrack(() => exerciseIds).includes(e.id));
      // One row per exercise even if the repo lists one twice.
      exercises = [...new Map(all.map((e) => [e.id, e])).values()];
    } catch {
      exercises = [];
    }
  });

  $effect(() => {
    if (loaded) return;
    loaded = true;
    const m = untrack(() => existing);
    if (!m) return;
    step = 2;
    name = m.name;
    loading = m.loading;
    unit = m.unit === "lbs" ? "lbs" : "kg";
    status = m.status;
    exerciseIds = [...m.exerciseIds];
    emptyKg = m.emptyKg ?? null;
    addOns = [...(m.addOns ?? [])];
    // Canvas EQ2: not asked yet, and they bring a stack pin: start with it picked.
    pin = m.extraLoad ? m.extraLoad.includes("pin") : get(kit).includes("pin");
    noExtra = m.extraLoad !== undefined && m.extraLoad.length === 0;
    const w = m.weights;
    const values = w?.kind === "stack" ? w.values : w?.kind === "linear" ? stackFromRuns(w.min, [{ step: w.step, to: w.max ?? w.min + w.step * 20 }]) : [];
    const r = runsFromStack(values);
    if (r && r.runs.length <= 4) { start = r.start; runs = r.runs; }
    else if (values.length) exact = values.join(", ");
  });

  // Back on step 2 of a new machine goes to step 1, not out of the editor.
  $effect(() => {
    if (step === 2 && !existing) return onBackKey(() => (step = 1));
  });

  const exactValues = $derived(exact === null ? null : [...new Set(exact.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b));
  const values = $derived(exactValues ?? stackFromRuns(start, runs));
  const unitLabel = $derived(unit === "lbs" ? "lb" : "kg");
  const preview = $derived(values.length <= 12 ? values.join(" · ") : `${values.slice(0, 6).join(" · ")} · … · ${values.slice(-2).join(" · ")}`);

  const ADDONS = $derived(unit === "lbs" ? [2.5, 5] : [1.25, 2.5]);

  const shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const score = (e: Exercise) => (exerciseIds.includes(e.id) ? 2 : words.some((w) => e.name.toLowerCase().includes(w)) ? 1 : 0);
    return exercises
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
      .slice(0, q ? 30 : 8);
  });

  function setRun(i: number, patch: Partial<StackRun>) {
    runs = runs.map((r, j) => (j === i ? { ...r, ...patch } : r));
  }

  function toggleExercise(id: string) {
    exerciseIds = exerciseIds.includes(id) ? exerciseIds.filter((x) => x !== id) : [...exerciseIds, id];
  }

  function save() {
    const smallestStep = values.length > 1 ? Math.min(...values.slice(1).map((v, i) => v - values[i]!)) : 2.5;
    const extraLoad: ExtraLoad[] | undefined =
      noExtra ? [] : addOns.length || pin ? [...(addOns.length ? ["addons" as const] : []), ...(pin ? ["pin" as const] : [])] : undefined;
    const machine: PlaceMachine = {
      id: existing?.id ?? createId("mach"),
      name: name.trim() || "Machine",
      unit,
      incrementKg: Math.max(0.5, fromDisplayWeight(smallestStep, unit)),
      weights: loading === "stack" || loading === "assisted" ? { kind: "stack", values } : undefined,
      loading,
      status,
      exerciseIds,
      extraLoad,
      emptyKg: loading === "plates" && emptyKg ? emptyKg : undefined,
      addOns: loading === "stack" && addOns.length ? addOns : undefined,
    };
    const target = place ? { place, created: false } : placesStore.placeForNewMachine();
    const at = placesStore.byId(target.place.id) ?? target.place;
    const others = at.machines.filter((m) => m.id !== machine.id);
    // Added from a workout: it's the one used for that exercise here from now on.
    const choices = forExercise && !existing ? { ...(at.choices ?? {}), [forExercise.id]: machine.id } : at.choices;
    const saved = placesStore.save({ ...at, machines: [...others, machine], ...(choices ? { choices } : {}) });
    onDone({ machine, place: saved, createdPlace: target.created });
  }

  const KINDS: { id: MachineLoading; title: string; hint: string }[] = [
    { id: "stack", title: "A pin in a weight stack", hint: "Pulldowns, cables, leg extensions" },
    { id: "plates", title: "Plates you load", hint: "Leg press, hack squat, plate-loaded rows, Smith machine" },
    { id: "assisted", title: "It helps you up", hint: "Assisted pull-up or dip: more weight is easier" },
  ];
  // Benches, racks and dip stations don't decide the number, so they're kit, not machines.
  // A machine saved as "no weight to set" before this still opens and saves as it was.
  import { get } from "svelte/store";
  import { kit } from "$lib/features/kit/kit";
</script>


<div class="flex flex-col gap-4">
  <div class="flex min-h-11 items-center justify-between">
    <Button variant="outline" size="sm" class="h-10"
      onclick={() => (step === 2 && !existing ? (step = 1) : onBack())}>
      <ArrowLeft class="h-4 w-4" /> {step === 2 && !existing ? "Back" : backLabel}
    </Button>
    {#if !existing}<span class="text-xs text-muted-foreground">{step} of 2</span>{/if}
  </div>

  {#key step}
  <div class="flex flex-col gap-4" in:popIn={{ duration: 180, y: 8 }}>
  {#if step === 1}
    <div class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-muted-foreground">New machine at {place?.name ?? "My gym"}{forExercise ? ` · for ${forExercise.name}` : ""}</span>
      <label for="m-name" class="text-[22px] font-bold">What is it?</label>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="m-name" bind:value={name} placeholder="Lat pulldown" autofocus={!forExercise}
      class="h-12 rounded-md border bg-background px-3 text-base font-medium focus:outline-none focus:ring-1 focus:ring-ring" />
    <h2 class="text-base font-semibold">How does the weight go on?</h2>
    <div class="flex flex-col gap-2">
      {#each existing?.loading === "none" ? [...KINDS, { id: "none" as MachineLoading, title: "No weight to set", hint: "" }] : KINDS as k (k.id)}
        <button type="button" class="flex min-h-[64px] flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left {loading === k.id ? 'border-2 border-foreground' : 'border-border'}"
          onclick={() => { loading = k.id; step = 2; }}>
          <span class="text-[15px] font-semibold">{k.title}</span>
          <span class="text-[13px] text-muted-foreground">{k.hint}</span>
        </button>
      {/each}
    </div>
    <p class="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-snug text-muted-foreground">
      Benches, racks and dip stations aren't machines: bench press is the bar and its plates on any
      bench. Tick them under "Also here" in {place?.name ?? "your place"}'s settings.
    </p>
  {:else}
    {#if existing}
      <label for="m-name2" class="sr-only">Name</label>
      <input id="m-name2" bind:value={name} class="h-12 rounded-md border bg-background px-3 text-lg font-bold" />
      <div role="group" aria-label="Status" class="grid grid-cols-4 gap-1">
        {#each [["in", "In"], ["out", "Out of order"], ["coming", "Coming"], ["removed", "Removed"]] as [s, label] (s)}
          <button type="button" aria-pressed={status === s} onclick={() => (status = s as MachineStatus)}
            class="min-h-11 rounded-lg border px-1 text-xs {status === s ? 'border-2 border-foreground font-semibold' : 'border-border'}">{label}</button>
        {/each}
      </div>
    {:else}
      <h1 class="text-[22px] font-bold">{loading === "stack" ? "Read the stack" : loading === "assisted" ? "Read the assistance stack" : loading === "plates" ? "Plates you load" : name || "No weight to set"}</h1>
    {/if}

    {#if loading === "stack" || loading === "assisted"}
      <p class="text-sm text-muted-foreground">Look at the numbers printed on the plates{loading === "assisted" ? ": more is more help" : ""}.</p>
      <div role="group" aria-label="Units on the stack" class="grid grid-cols-2 gap-1.5">
        {#each [["kg", "kg"], ["lbs", "lb"]] as [u, label] (u)}
          <button type="button" aria-pressed={unit === u} onclick={() => (unit = u as "kg" | "lbs")}
            class="h-10 rounded-lg border text-sm {unit === u ? 'border-2 border-foreground font-semibold' : 'border-border'}">{label}</button>
        {/each}
      </div>

      {#if exact === null}
        <div class="flex flex-col gap-2 rounded-xl border border-border p-2.5" in:reveal>
          <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From the top</span>
          <div class="grid grid-cols-3 gap-1.5">
            <label class="flex flex-col gap-0.5 text-xs font-medium">Starts at<input type="number" inputmode="decimal" min="0" bind:value={start} class="h-10 rounded-md border bg-background px-2 text-base font-semibold" /></label>
            <label class="flex flex-col gap-0.5 text-xs font-medium">Goes up by<input type="number" inputmode="decimal" min="0" value={runs[0]?.step} oninput={(e) => setRun(0, { step: Number(e.currentTarget.value) })} class="h-10 rounded-md border bg-background px-2 text-base font-semibold" /></label>
            <label class="flex flex-col gap-0.5 text-xs font-medium">Up to<input type="number" inputmode="decimal" min="0" value={runs[0]?.to} oninput={(e) => setRun(0, { to: Number(e.currentTarget.value) })} class="h-10 rounded-md border bg-background px-2 text-base font-semibold" /></label>
          </div>
          {#each runs.slice(1) as r, j (j)}
            {@const i = j + 1}
            <div class="flex items-center justify-between" transition:reveal>
              <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Then</span>
              <button type="button" aria-label="Remove this run" class="flex h-8 w-8 items-center justify-center text-muted-foreground" onclick={() => (runs = runs.filter((_, k) => k !== i))}><X class="h-4 w-4" /></button>
            </div>
            <div class="grid grid-cols-2 gap-1.5" transition:reveal>
              <label class="flex flex-col gap-0.5 text-xs font-medium">Goes up by<input type="number" inputmode="decimal" min="0" value={r.step} oninput={(e) => setRun(i, { step: Number(e.currentTarget.value) })} class="h-10 rounded-md border bg-background px-2 text-base font-semibold" /></label>
              <label class="flex flex-col gap-0.5 text-xs font-medium">Up to<input type="number" inputmode="decimal" min="0" value={r.to} oninput={(e) => setRun(i, { to: Number(e.currentTarget.value) })} class="h-10 rounded-md border bg-background px-2 text-base font-semibold" /></label>
            </div>
          {/each}
          <Button variant="outline" size="sm" class="self-start"
            onclick={() => { const last = runs.at(-1)!; runs = [...runs, { step: last.step * 2, to: last.to + last.step * 2 * 5 }]; }}>
            <Plus class="h-4 w-4" /> The jumps change partway
          </Button>
        </div>
        <Button variant="outline" size="sm" class="h-auto min-h-10 self-start whitespace-normal py-2 text-left" onclick={() => (exact = values.join(", "))}>Odd numbers on some plates? Type them as printed</Button>
      {:else}
        <label class="flex flex-col gap-1 text-sm font-medium" in:reveal>Every setting, as printed (separated by commas)
          <textarea bind:value={exact} rows="3" class="rounded-md border bg-background px-3 py-2 text-sm"></textarea>
        </label>
        <Button variant="outline" size="sm" class="self-start" onclick={() => (exact = null)}>Use runs instead</Button>
      {/if}

      <p class="rounded-lg bg-muted px-3 py-2.5 text-[13px]" aria-live="polite">
        {values.length ? `${preview} ${unitLabel}` : "No settings yet"} <span class="text-muted-foreground">({values.length} settings)</span>
      </p>

      {#if loading === "stack"}
        <fieldset class="flex flex-col gap-1.5">
          <legend class="mb-1.5 text-sm font-semibold">Can you add a little?</legend>
          <div class="flex flex-wrap gap-1.5">
            {#each ADDONS as a (a)}
              <button type="button" aria-pressed={addOns.includes(a)} onclick={() => { addOns = addOns.includes(a) ? addOns.filter((x) => x !== a) : [...addOns, a]; noExtra = false; }}
                class="min-h-10 rounded-full border px-3 text-sm {addOns.includes(a) ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border'}">{a} {unitLabel} add-on</button>
            {/each}
          </div>
        </fieldset>
        <!-- Canvas EQ2: past the top of the stack. -->
        <fieldset class="flex flex-col gap-1.5">
          <legend class="mb-1.5 text-sm font-semibold">Past the top</legend>
          <div class="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={pin} onclick={() => { pin = !pin; noExtra = false; }}
              class="min-h-10 rounded-full border px-3 text-sm {pin ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border'}">My stack pin</button>
            <button type="button" aria-pressed={noExtra} onclick={() => { noExtra = !noExtra; if (noExtra) { addOns = []; pin = false; } }}
              class="min-h-10 rounded-full border px-3 text-sm {noExtra ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border'}">No, make it harder</button>
          </div>
          {#if $kit.includes("pin")}<p class="text-xs text-muted-foreground">"My stack pin" is picked because you bring one. Untick it if this gym doesn't allow pins.</p>{/if}
        </fieldset>
      {/if}
    {:else if loading === "plates"}
      <p class="text-sm text-muted-foreground">Weights use this place's plates.</p>
      <label class="flex items-center justify-between gap-3 text-sm">Empty sled or carriage (kg, if you know it)
        <input type="number" inputmode="decimal" min="0" bind:value={emptyKg} class="h-11 w-24 rounded-md border bg-background px-3 text-right text-sm" />
      </label>
    {/if}

    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1.5 text-sm font-semibold">Exercises you do on it</legend>
      <div class="flex h-10 items-center gap-2 rounded-md border px-2.5">
        <Search class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <label for="ex-search" class="sr-only">Find an exercise</label>
        <input id="ex-search" bind:value={search} placeholder="Find an exercise" class="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
      </div>
      {#each shown as e (e.id)}
        <label class="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox checked={exerciseIds.includes(e.id)} onCheckedChange={() => toggleExercise(e.id)} />
          {e.name}
        </label>
      {/each}
      {#if exerciseIds.length}<p class="text-xs text-muted-foreground" transition:fade={{ duration: 120 }}>{exerciseIds.length} picked.</p>{/if}
    </fieldset>

    <button type="button" class="mt-2 h-12 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground disabled:opacity-50"
      disabled={(loading === "stack" || loading === "assisted") && values.length === 0} onclick={save}>
      {existing ? "Save" : "Save machine"}
    </button>
  {/if}
  </div>
  {/key}
</div>
