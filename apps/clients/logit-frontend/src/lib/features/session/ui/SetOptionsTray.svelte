<!-- A set's options, opened in the row by tapping its number (design canvas S-C): kind of set,
     how many more you could have done, rest after it, a note, delete. No sheet and no Save:
     every tap saves, and the other sets stay in view. -->
<script lang="ts">
  import { Trash2 } from "lucide-svelte";
  import { SET_TYPE_META, type SetEntry, type SetType } from "@logit/core/domain/workout";
  import { EFFORT, effortFor } from "./effort";

  type Patch = Partial<Pick<SetEntry, "setType" | "rpe" | "note" | "restDurationMs">>;

  let {
    setNumber = null,
    setType,
    rpe,
    note,
    restMs,
    showRest = true,
    disabled = false,
    onChange,
    onDelete,
  }: {
    setNumber?: number | null;
    setType: SetType;
    rpe: number | null | undefined;
    note: string | null | undefined;
    /** The rest that will run after this set (its own, else the default for its kind). */
    restMs: number | undefined;
    /** Off for a past workout, where rest no longer matters. */
    showRest?: boolean;
    disabled?: boolean;
    onChange: (patch: Patch) => void | Promise<void>;
    onDelete: () => void | Promise<void>;
  } = $props();

  const MAIN: SetType[] = ["warmup", "normal", "dropset", "failure"];
  const label = (t: SetType) => (t === "normal" ? "Working" : SET_TYPE_META.find((m) => m.type === t)?.label ?? t);
  const others = SET_TYPE_META.map((m) => m.type as SetType).filter((t) => !MAIN.includes(t));
  let moreKinds = $state(false);
  const showOthers = $derived(moreKinds || others.includes(setType));
  const effort = $derived(effortFor(rpe));

  function rest(ms: number | undefined): string {
    if (ms === undefined) return "Off";
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  const stepRest = (d: number) => onChange({ restDurationMs: Math.max(15_000, Math.min(600_000, (restMs ?? 75_000) + d)) });

  const chip = (on: boolean) =>
    `min-h-10 rounded-lg border px-1 text-[12px] ${on ? "border-2 border-foreground font-semibold" : "border-border"}`;
</script>

<div class="flex flex-col gap-3 border-t border-border/60 px-3 pb-3 pt-2.5" data-testid="set-options" aria-label="Set {setNumber ?? ''} options">
  <div role="group" aria-label="Kind of set" class="flex flex-col gap-1.5">
    <div class="grid grid-cols-4 gap-1">
      {#each MAIN as t (t)}
        <button type="button" aria-pressed={setType === t} class={chip(setType === t)} {disabled} onclick={() => onChange({ setType: t })}>{label(t)}</button>
      {/each}
    </div>
    {#if showOthers}
      <div class="grid grid-cols-4 gap-1">
        {#each others as t (t)}
          <button type="button" aria-pressed={setType === t} class={chip(setType === t)} {disabled} onclick={() => onChange({ setType: t })}>{label(t)}</button>
        {/each}
      </div>
    {:else}
      <button type="button" class="min-h-8 self-start text-xs text-muted-foreground" onclick={() => (moreKinds = true)}>More kinds: AMRAP, rest-pause, myo-reps</button>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <span class="w-16 shrink-0 text-[13px] text-muted-foreground" id="effort-{setNumber}">Left in it</span>
    <div role="group" aria-labelledby="effort-{setNumber}" class="grid flex-1 grid-cols-4 gap-1">
      {#each EFFORT as e (e.rpe)}
        {@const on = effort?.rpe === e.rpe}
        <button type="button" aria-pressed={on} aria-label="{e.left === '0' ? 'Nothing' : e.left} left (RPE {e.rpe})" class={chip(on)} {disabled}
          onclick={() => onChange({ rpe: on ? null : e.rpe })}>{e.left}</button>
      {/each}
    </div>
  </div>

  {#if showRest}<div class="flex items-center gap-2">
    <span class="w-16 shrink-0 text-[13px] text-muted-foreground">Rest</span>
    <button type="button" aria-label="15 seconds less rest" class="h-10 w-11 rounded-lg border border-border text-base" {disabled} onclick={() => stepRest(-15_000)}>−</button>
    <span class="flex-1 text-center text-[15px] font-semibold tabular-nums">{rest(restMs)}</span>
    <button type="button" aria-label="15 seconds more rest" class="h-10 w-11 rounded-lg border border-border text-base" {disabled} onclick={() => stepRest(15_000)}>+</button>
  </div>{/if}

  <div class="flex items-center gap-2">
    <label for="set-note-{setNumber}" class="w-16 shrink-0 text-[13px] text-muted-foreground">Note</label>
    <input id="set-note-{setNumber}" type="text" placeholder="Optional" value={note ?? ""} {disabled}
      onchange={(e) => onChange({ note: (e.currentTarget as HTMLInputElement).value.trim() || null })}
      class="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm" />
    <button type="button" aria-label="Delete set {setNumber ?? ''}" class="flex h-10 w-11 items-center justify-center text-destructive" {disabled} onclick={() => void onDelete()}>
      <Trash2 class="h-4 w-4" />
    </button>
  </div>
</div>
