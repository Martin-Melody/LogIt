<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ChevronDown, ChevronUp, Trash2 } from "lucide-svelte";
  import { SET_TYPE_META, type SetEntry, type SetType } from "@logit/core/domain/workout";
  import { EFFORT, effortFor } from "./effort";
  import { chip } from "$lib/components/ui/choice";

  // A set's options in the workout (design canvas S-set-options): kind of set, reps left,
  // rest after it, a note, and Move up / Move down / Delete for anyone who can't drag or swipe.
  // Every tap saves; the sheet swipes down to close.
  type Patch = Partial<Pick<SetEntry, "setType" | "rpe" | "note" | "restDurationMs">>;

  const {
    open,
    onOpenChange,
    title,
    subtitle = null,
    setType,
    rpe,
    note,
    restMs,
    disabled = false,
    canMoveUp = false,
    canMoveDown = false,
    onChange,
    onMoveUp,
    onMoveDown,
    onDelete,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** "Set 2 · Barbell Row". */
    title: string;
    /** "Planned 87.5 kg × 8". */
    subtitle?: string | null;
    setType: SetType;
    rpe: number | null | undefined;
    note: string | null | undefined;
    restMs: number | undefined;
    disabled?: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onChange: (patch: Patch) => void | Promise<void>;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
  } = $props();

  const KINDS: SetType[] = ["normal", "warmup", "dropset", "failure"];
  const label = (t: SetType) => (t === "normal" ? "Working" : SET_TYPE_META.find((m) => m.type === t)?.label ?? t);
  const others = SET_TYPE_META.map((m) => m.type as SetType).filter((t) => !KINDS.includes(t));
  let moreKinds = $state(false);
  const showOthers = $derived(moreKinds || others.includes(setType));
  const effort = $derived(effortFor(rpe));

  function restLabel(ms: number | undefined): string {
    if (ms === undefined) return "Off";
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  const stepRest = (d: number) => onChange({ restDurationMs: Math.max(15_000, Math.min(600_000, (restMs ?? 75_000) + d)) });
  const small = "h-11 w-14 rounded-xl border border-input text-sm font-medium tabular-nums transition-colors hover:bg-muted disabled:opacity-40";
  const action = "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40";
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="gap-4 bg-card" data-testid="set-options">
    <div class="flex flex-col gap-0.5 pr-8">
      <Dialog.Title class="text-[19px] font-semibold">{title}</Dialog.Title>
      {#if subtitle}<Dialog.Description class="text-[13px] tabular-nums">{subtitle}</Dialog.Description>{:else}<Dialog.Description class="sr-only">Set options</Dialog.Description>{/if}
    </div>

    <div role="group" aria-label="Kind of set" class="flex flex-col gap-2">
      <span class="text-[13px] text-muted-foreground">Kind of set</span>
      <div class="flex flex-wrap gap-2">
        {#each KINDS as t (t)}
          <button type="button" class={chip(setType === t)} aria-pressed={setType === t} {disabled} onclick={() => onChange({ setType: t })}>{label(t)}</button>
        {/each}
        {#if showOthers}
          {#each others as t (t)}
            <button type="button" class={chip(setType === t)} aria-pressed={setType === t} {disabled} onclick={() => onChange({ setType: t })}>{label(t)}</button>
          {/each}
        {:else}
          <button type="button" class={chip(false)} onclick={() => (moreKinds = true)}>AMRAP, rest-pause, myo… <ChevronDown class="h-3.5 w-3.5" /></button>
        {/if}
      </div>
    </div>

    <div role="group" aria-label="Reps left in it" class="flex flex-col gap-2">
      <span class="text-[13px] text-muted-foreground">Reps left in it</span>
      <div class="grid grid-cols-4 gap-1.5">
        {#each EFFORT as e (e.rpe)}
          {@const on = effort?.rpe === e.rpe}
          <button type="button" aria-pressed={on} aria-label="{e.left === '0' ? 'Nothing' : e.left} left (RPE {e.rpe})" {disabled}
            class="flex h-12 flex-col items-center justify-center rounded-xl border text-base font-semibold transition-colors {on ? 'border-transparent bg-primary text-primary-foreground' : 'border-input'}"
            onclick={() => onChange({ rpe: on ? null : e.rpe })}>
            {e.left}<span class="text-[10px] font-normal {on ? '' : 'text-muted-foreground'}">RPE {e.rpe}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-[13px] text-muted-foreground">Rest after this set</span>
      <div class="flex items-center gap-3">
        <button type="button" class={small} aria-label="15 seconds less rest" {disabled} onclick={() => stepRest(-15_000)}>−15</button>
        <b class="flex-1 text-center text-xl font-semibold tabular-nums">{restLabel(restMs)}</b>
        <button type="button" class={small} aria-label="15 seconds more rest" {disabled} onclick={() => stepRest(15_000)}>+15</button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <label for="set-note-sheet" class="text-[13px] text-muted-foreground">Note</label>
      <input id="set-note-sheet" type="text" placeholder="Optional, e.g. grip slipped" value={note ?? ""} {disabled}
        onchange={(e) => onChange({ note: (e.currentTarget as HTMLInputElement).value.trim() || null })}
        class="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[15px]" />
    </div>

    <div class="flex gap-2">
      <button type="button" class={action} disabled={!canMoveUp || disabled} onclick={onMoveUp}><ChevronUp class="h-4 w-4" /> Move up</button>
      <button type="button" class={action} disabled={!canMoveDown || disabled} onclick={onMoveDown}><ChevronDown class="h-4 w-4" /> Move down</button>
      <button type="button" class="{action} text-destructive" {disabled} onclick={() => { onOpenChange(false); onDelete(); }}><Trash2 class="h-4 w-4" /> Delete</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
