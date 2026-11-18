<script lang="ts">
  // Settings › Your places (My gym, design canvas G1/G10). Optional: with no places everything
  // works as before. Making one starts from a template; "Where are you today?" only shows with
  // two or more and can be turned off here (Martin: it must only help, never block a workout).
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, ChevronRight, Dumbbell, Home, MapPin, Plus } from "lucide-svelte";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { newPlace, type PlaceKind, type PlaceTemplate } from "@logit/core/domain/place";

  let adding = $state(false);
  let name = $state("");
  let kind = $state<PlaceKind>("gym");
  let template = $state<PlaceTemplate>("gym");
  let ask = $state(placesStore.askEnabled);

  onMount(() => void placesStore.migrateExerciseMachines());

  const TEMPLATES: { id: PlaceTemplate; label: string; hint: string }[] = [
    { id: "gym", label: "A full gym", hint: "Barbells, dumbbells to 60 kg, racks, cables" },
    { id: "home-rack", label: "Home rack", hint: "Bar and plates, a rack, a bench, dumbbells" },
    { id: "dumbbells", label: "Dumbbells", hint: "Adjustable dumbbells and a bench" },
    { id: "bodyweight", label: "Bodyweight", hint: "A pull-up bar, nothing else" },
  ];

  function pickKind(k: PlaceKind) {
    kind = k;
    template = k === "home" ? "home-rack" : k === "gym" ? "gym" : "bodyweight";
    if (!name.trim() || ["My gym", "Home", "Somewhere else"].includes(name)) name = k === "home" ? "Home" : k === "gym" ? "My gym" : "";
  }

  function create() {
    const p = placesStore.save(newPlace(name.trim() || (kind === "home" ? "Home" : "My gym"), kind, template));
    void goto(`/settings/places/${p.id}`);
  }

  function summary(p: (typeof placesStore.active)[number]): string {
    const bits: string[] = [];
    const live = p.machines.filter((m) => m.status !== "removed").length;
    if (live) bits.push(`${live} machine${live === 1 ? "" : "s"}`);
    if (p.barbell) bits.push("barbell");
    if (p.dumbbells) bits.push("dumbbells");
    if (!bits.length) bits.push(p.kit.length ? `${p.kit.length} pieces of kit` : "nothing added yet");
    const days = p.usualDays?.length ? ` · ${p.usualDays.map((d) => "MTWTFSS"[d - 1]).join(" ")}` : "";
    return bits.join(", ") + days;
  }
</script>

<div class="mx-auto flex min-h-screen w-full max-w-sm flex-col bg-background px-6 pb-8 pt-10 text-foreground">
  <button type="button" class="mb-4 flex min-h-11 items-center gap-1.5 self-start text-sm text-muted-foreground" onclick={() => goto("/settings")}>
    <ArrowLeft class="h-4 w-4" /> Settings
  </button>
  <h1 class="mb-1.5 text-[22px] font-bold">Your places</h1>
  <p class="mb-5 text-sm text-muted-foreground">Where you train and what's there. Logit uses it to plan weights you can actually pick up. Optional.</p>

  {#if placesStore.active.length > 0}
    <ul class="mb-4 flex flex-col rounded-xl border border-border">
      {#each placesStore.active as p (p.id)}
        <li class="border-b border-border last:border-b-0">
          <a href="/settings/places/{p.id}" class="flex min-h-[60px] items-center gap-3 px-3.5 py-3">
            {#if p.kind === "home"}<Home class="h-5 w-5 shrink-0" />{:else if p.kind === "gym"}<Dumbbell class="h-5 w-5 shrink-0" />{:else}<MapPin class="h-5 w-5 shrink-0" />{/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium">{p.name}</span>
              <span class="block truncate text-xs text-muted-foreground">{summary(p)}</span>
            </span>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  {#if adding}
    <form class="flex flex-col gap-3 rounded-xl border border-border p-3.5" onsubmit={(e) => { e.preventDefault(); create(); }}>
      <div role="group" aria-label="Kind of place" class="grid grid-cols-3 gap-1.5">
        {#each [["gym", "A gym"], ["home", "Home"], ["other", "Other"]] as [k, label] (k)}
          <button type="button" aria-pressed={kind === k} onclick={() => pickKind(k as PlaceKind)}
            class="min-h-11 rounded-lg border text-sm {kind === k ? 'border-2 border-foreground font-semibold' : 'border-border'}">{label}</button>
        {/each}
      </div>
      <label for="place-name" class="text-sm font-medium">Name</label>
      <input id="place-name" bind:value={name} placeholder={kind === "home" ? "Home" : "Northside Fitness"}
        class="h-11 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-sm font-medium">Start from</legend>
        {#each TEMPLATES as t (t.id)}
          <label class="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 {template === t.id ? 'border-2 border-foreground' : 'border-border'}">
            <input type="radio" name="template" value={t.id} bind:group={template} class="h-4 w-4 accent-foreground" />
            <span><span class="block text-sm font-medium">{t.label}</span><span class="block text-xs text-muted-foreground">{t.hint}</span></span>
          </label>
        {/each}
      </fieldset>
      <p class="text-xs text-muted-foreground">You can change everything after. A home place is never shared and has no location.</p>
      <div class="flex gap-2">
        <button type="submit" class="h-11 flex-1 rounded-lg bg-primary text-sm font-medium text-primary-foreground">Make it</button>
        <button type="button" class="h-11 rounded-lg border border-border px-4 text-sm" onclick={() => (adding = false)}>Cancel</button>
      </div>
    </form>
  {:else}
    <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[15px] font-medium"
      onclick={() => { adding = true; pickKind(placesStore.active.some((p) => p.kind === "home") ? "gym" : placesStore.active.length ? "home" : "gym"); }}>
      <Plus class="h-4 w-4" /> Add a place
    </button>
  {/if}

  {#if placesStore.active.length >= 2}
    <label class="mt-6 flex items-start justify-between gap-3 border-t border-border pt-4">
      <span>
        <span class="block text-sm font-medium">Ask "Where are you today?"</span>
        <span class="block text-xs text-muted-foreground">When a workout starts. Your usual place for the day is picked, and you can always skip it.</span>
      </span>
      <input type="checkbox" class="mt-1 h-5 w-5 accent-foreground" bind:checked={ask} onchange={() => placesStore.setAsk(ask)} />
    </label>
  {/if}
</div>
