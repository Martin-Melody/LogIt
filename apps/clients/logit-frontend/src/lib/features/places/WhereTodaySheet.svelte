<!-- "Where are you today?" (design canvas G9). Shown once per workout, only with two or more
     places and only until a set is logged. The usual place for the day is picked; Skip starts
     with no place (exercises as they are); "Don't ask me this" turns it off (back on in
     Settings › Your places). Martin: it only helps, it never blocks a workout. -->
<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { getExercises, type WorkoutSession } from "@logit/core/domain/workout";
  import { machinesFor, type Place } from "@logit/core/domain/place";
  import { placesStore } from "./places.svelte";

  let { session, changing = false, onPick }: {
    session: WorkoutSession;
    /** Asked again mid-workout from an exercise card: no Skip or "Don't ask me this". */
    changing?: boolean;
    onPick: (placeId: string | null) => void;
  } = $props();

  const places = $derived(placesStore.active);
  let chosen = $state<string | null>(untrack(() => session.placeId ?? placesStore.defaultFor()?.id ?? null));
  let open = $state(true);

  const exerciseIds = $derived(getExercises(session).flatMap((e) => (e.exerciseId ? [e.exerciseId] : [])));
  const usual = $derived(placesStore.defaultFor());

  function line(p: Place): string {
    const withMachine = exerciseIds.filter((id) => machinesFor(p, id).length > 0).length;
    const bits: string[] = [];
    const weekday = ((new Date().getDay() + 6) % 7) + 1;
    if (p.usualDays?.includes(weekday)) bits.push("Your usual place today");
    else if (usual?.id === p.id) bits.push("Last time");
    if (exerciseIds.length) bits.push(withMachine ? `machines for ${withMachine} of ${exerciseIds.length} exercises` : "no machines set up for these exercises");
    return bits.join(" · ") || p.kind;
  }

  function done(placeId: string | null) {
    open = false;
    onPick(placeId);
  }
</script>

<Dialog.Root {open} onOpenChange={(v) => { if (!v) done(session.placeId ?? null); }}>
  <Dialog.Content sheet class="flex flex-col gap-3 bg-card">
    <Dialog.Header>
      <Dialog.Title>{changing ? "Where are you?" : "Where are you today?"}</Dialog.Title>
      <Dialog.Description>Machines and weights come from there.</Dialog.Description>
    </Dialog.Header>

    <RadioGroup.Root value={chosen ?? ""} onValueChange={(v) => (chosen = v || null)} aria-label="Place" class="flex flex-col gap-2">
      {#each places as p (p.id)}
        <label class="flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2.5 {chosen === p.id ? 'border-2 border-foreground' : 'border-border'}">
          <RadioGroup.Item value={p.id} />
          <span class="min-w-0">
            <span class="block text-sm font-semibold">{p.name}</span>
            <span class="block text-[13px] text-muted-foreground">{line(p)}</span>
          </span>
        </label>
      {/each}
      <label class="flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2.5 {chosen === null ? 'border-2 border-foreground' : 'border-border'}">
        <RadioGroup.Item value="" />
        <span>
          <span class="block text-sm font-semibold">Somewhere else</span>
          <span class="block text-[13px] text-muted-foreground">Hotel, a friend's gym: pick or swap as you go</span>
        </span>
      </label>
    </RadioGroup.Root>

    <p class="rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-snug">
      Squats and bench are the same lift anywhere, so your numbers carry over. Machines start from the last time on that machine.
    </p>

    <Button class="h-12 text-[15px]" onclick={() => { if (chosen) placesStore.rememberUsed(chosen); done(chosen); }}>
      {chosen
        ? `${changing ? "Use" : "Start at"} ${places.find((p) => p.id === chosen)?.name ?? "this place"}`
        : changing ? "Somewhere else" : "Start somewhere else"}
    </Button>
    {#if !changing}<div class="grid grid-cols-2 gap-2">
      <Button variant="outline" class="h-11" onclick={() => done(session.placeId ?? null)}>Skip, just start</Button>
      <Button variant="ghost" class="h-11 text-muted-foreground" onclick={() => { placesStore.setAsk(false); done(session.placeId ?? null); }}>Don't ask me this</Button>
    </div>{/if}
  </Dialog.Content>
</Dialog.Root>
