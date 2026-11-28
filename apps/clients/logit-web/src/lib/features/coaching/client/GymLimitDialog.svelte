<!-- A client's plan outgrows their gym (canvas EQ1): told ahead, once, and picks what happens.
     More reps then a harder version (picked now, or slower reps, or ask me then); load past the
     stack with their pin; or swap it from that week in their copy only. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import OptionSelect from "$lib/components/option-select.svelte";
  import NamePicker from "$lib/features/plan/NamePicker.svelte";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import type { GymLimit } from "@logit/core/domain/gymLimits";
  import type { ProgramStrength } from "@logit/core/domain/CoachProgram";

  let { open = $bindable(false), limit, first, bringsPin, onpick }: {
    open?: boolean;
    limit: GymLimit;
    first: string;
    bringsPin: boolean;
    onpick: (choice: { atTop: NonNullable<ProgramStrength["atTop"]> } | { swapFrom: number; exerciseName: string; exerciseId?: string }) => Promise<void> | void;
  } = $props();

  let kind = $state<"reps" | "pin" | "swap">("reps");
  let then = $state<"harder" | "slower" | "ask">("harder");
  let harder = $state<string>("");
  let swapTo = $state<{ name: string; id?: string } | null>(null);
  let index = $state<ExerciseIndex | null>(null);
  let busy = $state(false);
  $effect(() => {
    if (!open) return;
    kind = "reps"; then = "harder"; swapTo = null;
    harder = /extension|curl|press|row/i.test(limit.exerciseName) ? `Single-${/curl|press|row/i.test(limit.exerciseName) ? "arm" : "leg"} ${limit.exerciseName.toLowerCase()}` : "";
    void loadExerciseIndex([]).then((i) => (index = i), () => {});
  });
  const search = (q: string) => (index?.search(q, 8) ?? []).map((e) => ({ name: e.name, detail: e.primaryMuscles.slice(0, 2).join(", ") || undefined }));
  const can = $derived(kind === "pin" ? bringsPin : kind === "swap" ? !!swapTo : then !== "harder" || !!harder.trim());

  async function use() {
    busy = true;
    try {
      if (kind === "swap" && swapTo) await onpick({ swapFrom: limit.week, exerciseName: swapTo.name, exerciseId: swapTo.id });
      else if (kind === "pin") await onpick({ atTop: { then: "pin" } });
      else await onpick({ atTop: then === "harder" ? { then: "harder", exercise: harder.trim() } : { then } });
      open = false;
    } finally {
      busy = false;
    }
  }
  const OPTIONS = $derived([
    { id: "reps" as const, title: "More reps, then something harder", text: `Stay at ${limit.topKg} kg up to 15 reps; then ${first}'s plan switches to what you pick. They see it as your plan.` },
    { id: "pin" as const, title: `Load past the stack with ${first}'s pin`, text: bringsPin ? `${first} brings a stack pin. They're asked once if they can use it here.` : `${first} hasn't said they bring a stack pin.` },
    { id: "swap" as const, title: `Swap it from week ${limit.week}`, text: "Another exercise from then on, in their copy only." },
  ]);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3.5 overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{limit.what === "dumbbells" ? `Heaviest dumbbells at ${limit.placeName}: ${limit.topKg} kg` : `${limit.what} at ${limit.placeName} goes to ${limit.topKg} kg`}</Dialog.Title>
      <Dialog.Description>{first}'s plan for {limit.exerciseName} reaches {limit.plannedKg} kg in week {limit.week}. From their gym's details in LogIt.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-2" role="radiogroup" aria-label="What should happen">
      {#each OPTIONS as o (o.id)}
        <button type="button" role="radio" aria-checked={kind === o.id} disabled={o.id === "pin" && !bringsPin} onclick={() => (kind = o.id)}
          class="flex flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors disabled:opacity-50 {kind === o.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'}">
          <span class="text-[13px] font-semibold">{o.title}</span><span class="text-xs text-muted-foreground">{o.text}</span>
        </button>
      {/each}
    </div>
    {#if kind === "reps"}
      <div class="flex flex-col gap-2">
        <OptionSelect value={then} aria-label="Then" onValueChange={(v) => (then = v as typeof then)}
          options={[{ value: "harder", label: "A harder version" }, { value: "slower", label: "Slower reps (3 seconds down, a pause)" }, { value: "ask", label: "Ask me then" }]} />
        {#if then === "harder"}
          {#if harder}
            <p class="text-[13px]">Then <b class="font-semibold">{harder}</b> <Button variant="ghost" size="sm" onclick={() => (harder = "")}>Change</Button></p>
          {:else}
            <NamePicker id="gym-harder" label="The harder version" placeholder="Single-leg extension" {search} onPick={(n) => (harder = n)} />
          {/if}
        {/if}
      </div>
    {:else if kind === "swap"}
      {#if swapTo}
        <p class="text-[13px]">From week {limit.week}: <b class="font-semibold">{swapTo.name}</b> <Button variant="ghost" size="sm" onclick={() => (swapTo = null)}>Change</Button></p>
      {:else}
        <NamePicker id="gym-swap" label="Swap for" placeholder="Search exercises" {search} onPick={(n) => (swapTo = { name: n, id: index?.get(n)?.id })} />
      {/if}
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Later</Button>
      <Button disabled={!can || busy} onclick={() => void use()}>Use this</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
