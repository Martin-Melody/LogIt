<script lang="ts">
  // One place (design canvas G1 for a gym, G10 for home): what's there. Every change saves
  // straight away. Machines open their own screen (X6/X7).
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, ChevronRight, Plus } from "lucide-svelte";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { KIT, dumbbellWeightsKg, type Kit, type Place, type MachineStatus } from "@logit/core/domain/place";

  const id = $derived(page.params.id ?? "");
  const place = $derived(placesStore.byId(id));

  const KIT_LABELS: Record<Kit, string> = {
    "squat-rack": "Squat rack", "flat-bench": "Flat bench", "incline-bench": "Incline bench", "pull-up-bar": "Pull-up bar",
    "dip-bars": "Dip bars", bands: "Bands", "cable-pulley": "Cable pulley", "trap-bar": "Trap bar", "ez-bar": "EZ bar",
    rings: "Rings", box: "Box",
  };
  const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const STATUS: Record<MachineStatus, string> = { in: "", out: "Out of order", coming: "Coming", removed: "Removed" };

  function save(patch: Partial<Place>) {
    if (place) placesStore.save({ ...place, ...patch });
  }

  /** "12, 16, 20" → [12, 16, 20]; anything else is dropped. */
  function numbers(text: string): number[] {
    return [...new Set(text.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  }

  function toggleDay(d: number) {
    if (!place) return;
    const days = new Set(place.usualDays ?? []);
    if (days.has(d)) days.delete(d); else days.add(d);
    save({ usualDays: [...days].sort() });
  }

  function togglePlate(kg: number) {
    if (!place?.barbell) return;
    const plates = new Set(place.barbell.platesKg);
    if (plates.has(kg)) plates.delete(kg); else plates.add(kg);
    save({ barbell: { ...place.barbell, platesKg: [...plates].sort((a, b) => b - a) } });
  }

  function toggleKit(k: Kit) {
    if (!place) return;
    save({ kit: place.kit.includes(k) ? place.kit.filter((x) => x !== k) : [...place.kit, k] });
  }

  const machines = $derived(place ? [...place.machines].sort((a, b) => Number(a.status === "removed") - Number(b.status === "removed") || a.name.localeCompare(b.name)) : []);
  const dumbbellRange = $derived(dumbbellWeightsKg(place?.dumbbells));

  let confirmRemove = $state(false);
</script>

<div class="mx-auto flex min-h-screen w-full max-w-sm flex-col gap-5 bg-background px-6 pb-10 pt-10 text-foreground">
  <button type="button" class="flex min-h-11 items-center gap-1.5 self-start text-sm text-muted-foreground" onclick={() => goto("/settings/places")}>
    <ArrowLeft class="h-4 w-4" /> Your places
  </button>

  {#if !place}
    <p class="text-sm text-muted-foreground">This place isn't on this phone.</p>
  {:else}
    <div class="flex flex-col gap-1.5">
      <label for="pl-name" class="sr-only">Name</label>
      <input id="pl-name" value={place.name} onchange={(e) => save({ name: (e.currentTarget.value.trim() || place.name) })}
        class="h-12 rounded-md border border-transparent bg-background px-0 text-[22px] font-bold hover:border-border focus:border-border focus:px-2 focus:outline-none" />
      <p class="text-xs text-muted-foreground">{place.kind === "home" ? "Private. Never shared, no location." : "Private to you for now."}</p>
    </div>

    <section aria-labelledby="days-h" class="flex flex-col gap-2">
      <h2 id="days-h" class="text-sm font-semibold">Usually here on</h2>
      <div class="grid grid-cols-7 gap-1">
        {#each DAYS as d, i (i)}
          <button type="button" aria-pressed={place.usualDays?.includes(i + 1) ?? false} aria-label={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}
            class="h-11 rounded-lg border text-sm {place.usualDays?.includes(i + 1) ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border'}"
            onclick={() => toggleDay(i + 1)}>{d}</button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">Picks this place when a workout starts on those days. Optional.</p>
    </section>

    <section aria-labelledby="machines-h" class="flex flex-col rounded-xl border border-border">
      <div class="flex items-baseline justify-between px-3.5 pb-2 pt-3">
        <h2 id="machines-h" class="text-[15px] font-semibold">Machines · {place.machines.filter((m) => m.status !== "removed").length}</h2>
      </div>
      {#each machines as m (m.id)}
        <a href="/settings/places/{place.id}/machine/{m.id}" class="flex min-h-[52px] items-center justify-between gap-3 border-t border-border px-3.5 py-2">
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium {m.status === 'removed' ? 'text-muted-foreground line-through' : ''}">{m.name}</span>
            <span class="block truncate text-xs text-muted-foreground">{m.exerciseIds.length} exercise{m.exerciseIds.length === 1 ? "" : "s"}{m.weights?.kind === "stack" ? ` · ${m.weights.values[0]}–${m.weights.values.at(-1)} ${m.unit === "lbs" ? "lb" : "kg"}` : ""}</span>
          </span>
          {#if STATUS[m.status]}<span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold {m.status === 'out' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}">{STATUS[m.status]}</span>{/if}
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
      {/each}
      <a href="/settings/places/{place.id}/machine/new" class="flex min-h-12 items-center gap-2 border-t border-border px-3.5 text-sm font-medium">
        <Plus class="h-4 w-4" /> Add a machine
      </a>
    </section>

    <section aria-labelledby="bar-h" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 id="bar-h" class="text-sm font-semibold">Barbell and plates</h2>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">There's a barbell
          <input type="checkbox" class="h-5 w-5 accent-foreground" checked={!!place.barbell}
            onchange={(e) => save({ barbell: e.currentTarget.checked ? { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] } : undefined })} />
        </label>
      </div>
      {#if place.barbell}
        <label class="flex items-center justify-between gap-3 text-sm">Bar weight (kg)
          <input type="number" inputmode="decimal" min="0" step="0.5" value={place.barbell.barKg}
            onchange={(e) => save({ barbell: { ...place.barbell!, barKg: Number(e.currentTarget.value) || 20 } })}
            class="h-11 w-24 rounded-md border bg-background px-3 text-right text-sm" />
        </label>
        <div role="group" aria-label="Plates here (kg)" class="flex flex-wrap gap-1.5">
          {#each PLATES as kg (kg)}
            <button type="button" aria-pressed={place.barbell.platesKg.includes(kg)} onclick={() => togglePlate(kg)}
              class="h-10 min-w-12 rounded-full border px-3 text-sm {place.barbell.platesKg.includes(kg) ? 'border-foreground bg-primary font-semibold text-primary-foreground' : 'border-border'}">{kg}</button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">Plates you have, in kg. Weights are planned so they can be loaded.</p>
      {/if}
    </section>

    <section aria-labelledby="db-h" class="flex flex-col gap-2">
      <h2 id="db-h" class="text-sm font-semibold">Dumbbells</h2>
      <div role="group" aria-label="Dumbbells here" class="grid grid-cols-3 gap-1.5">
        {#each [["none", "None"], ["pairs", "Fixed pairs"], ["adjustable", "Adjustable"]] as [k, label] (k)}
          {@const on = (place.dumbbells?.kind ?? "none") === k}
          <button type="button" aria-pressed={on}
            class="min-h-11 rounded-lg border text-sm {on ? 'border-2 border-foreground font-semibold' : 'border-border'}"
            onclick={() => save({ dumbbells: k === "none" ? undefined : k === "pairs" ? { kind: "pairs", kg: [5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25] } : { kind: "adjustable", minKg: 2.5, stepKg: 2.5, maxKg: 24 } })}>{label}</button>
        {/each}
      </div>
      {#if place.dumbbells?.kind === "pairs"}
        <label class="flex flex-col gap-1 text-xs text-muted-foreground">Weights you have (kg, separated by commas)
          <input value={place.dumbbells.kg.join(", ")} onchange={(e) => save({ dumbbells: { kind: "pairs", kg: numbers(e.currentTarget.value) } })}
            class="h-11 rounded-md border bg-background px-3 text-sm text-foreground" />
        </label>
      {:else if place.dumbbells?.kind === "adjustable"}
        {@const d = place.dumbbells}
        <div class="grid grid-cols-3 gap-2">
          <label class="flex flex-col gap-1 text-xs font-medium">Lightest<input type="number" inputmode="decimal" value={d.minKg} onchange={(e) => save({ dumbbells: { ...d, minKg: Number(e.currentTarget.value) || d.minKg } })} class="h-11 rounded-md border bg-background px-2 text-sm" /></label>
          <label class="flex flex-col gap-1 text-xs font-medium">Goes up by<input type="number" inputmode="decimal" value={d.stepKg} onchange={(e) => save({ dumbbells: { ...d, stepKg: Number(e.currentTarget.value) || d.stepKg } })} class="h-11 rounded-md border bg-background px-2 text-sm" /></label>
          <label class="flex flex-col gap-1 text-xs font-medium">Heaviest<input type="number" inputmode="decimal" value={d.maxKg} onchange={(e) => save({ dumbbells: { ...d, maxKg: Number(e.currentTarget.value) || d.maxKg } })} class="h-11 rounded-md border bg-background px-2 text-sm" /></label>
        </div>
      {/if}
      {#if dumbbellRange.length}
        <p class="text-xs text-muted-foreground">{dumbbellRange.length} weights, {dumbbellRange[0]} to {dumbbellRange.at(-1)} kg.</p>
      {/if}
    </section>

    <section aria-labelledby="kb-h" class="flex flex-col gap-1.5">
      <h2 id="kb-h" class="text-sm font-semibold">Kettlebells</h2>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">Weights you have (kg, separated by commas; empty if none)
        <input value={(place.kettlebellsKg ?? []).join(", ")} onchange={(e) => { const kb = numbers(e.currentTarget.value); save({ kettlebellsKg: kb.length ? kb : undefined }); }}
          class="h-11 rounded-md border bg-background px-3 text-sm text-foreground" />
      </label>
    </section>

    <section aria-labelledby="kit-h" class="flex flex-col gap-2">
      <h2 id="kit-h" class="text-sm font-semibold">Also here</h2>
      <div class="flex flex-wrap gap-1.5">
        {#each KIT as k (k)}
          <button type="button" aria-pressed={place.kit.includes(k)} onclick={() => toggleKit(k)}
            class="min-h-10 rounded-full border px-3 text-sm {place.kit.includes(k) ? 'border-foreground bg-primary font-medium text-primary-foreground' : 'border-border'}">{KIT_LABELS[k]}</button>
        {/each}
      </div>
    </section>

    <section class="flex flex-col gap-2 border-t border-border pt-4">
      <button type="button" class="min-h-11 text-left text-sm" onclick={() => { placesStore.archive(place.id); void goto("/settings/places"); }}>
        Stopped going here? <span class="font-medium underline">Archive it</span> <span class="block text-xs text-muted-foreground">Your history stays; it's just no longer offered.</span>
      </button>
      {#if confirmRemove}
        <div class="flex items-center gap-3 text-sm">
          <span class="flex-1">Delete {place.name} for good?</span>
          <button type="button" class="min-h-11 font-medium text-destructive" onclick={() => { placesStore.remove(place.id); void goto("/settings/places"); }}>Delete</button>
          <button type="button" class="min-h-11" onclick={() => (confirmRemove = false)}>Keep</button>
        </div>
      {:else}
        <button type="button" class="min-h-11 self-start text-sm text-destructive" onclick={() => (confirmRemove = true)}>Delete this place</button>
      {/if}
    </section>
  {/if}
</div>
