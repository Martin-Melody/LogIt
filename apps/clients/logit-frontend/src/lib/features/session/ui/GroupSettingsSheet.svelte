<script lang="ts">
  // "Edit circuit / superset": a group's name, type, rounds and rests. Knows nothing about
  // where the group is kept: the workout (GroupEditSheet) and the split day editor pass
  // its values and apply the changes. Every change saves straight away, except the name.
  import { X, Minus, Plus, Link2Off, Trash2 } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { sheetUp } from "$lib/transitions";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { chip, segment, segmentTrack } from "$lib/components/ui/choice";
  import { profile } from "$lib/stores/profile.store";
  import type { GroupKind, GroupSettingsPatch, SupersetInfo } from "@logit/core/domain/workout";
  import { groupKindOf, groupLabel } from "@logit/core/domain/workout";
  import { resolveGroupTiming } from "@logit/core/domain/circuit";
  import { circuitDefaultsFrom, formatClock, formatRestMs } from "$lib/features/session/circuit/circuitSettings";

  const {
    open = false,
    info,
    memberCount,
    rounds,
    hasDrills,
    canRemoveRound,
    roundsHint,
    estimate = null,
    saving = false,
    onClose,
    onPatch,
    onKind,
    onRoundsChange,
    onUngroup,
    onRemove,
  } = $props<{
    open?: boolean;
    /** The group's own settings; unset fields are the defaults. */
    info: Pick<SupersetInfo, "label" | "kind" | "roundRestMs" | "memberRestMs" | "leadInMs"> | undefined;
    memberCount: number;
    rounds: number;
    /** Drills are in it, so the countdown can run it: shows the get-ready setting. */
    hasDrills: boolean;
    canRemoveRound: boolean;
    /** Under "Rounds", e.g. what taking one away does. */
    roundsHint: string;
    /** How long it takes, when it can be worked out. */
    estimate?: { roundMs: number; totalMs: number } | null;
    saving?: boolean;
    onClose: () => void;
    onPatch: (patch: GroupSettingsPatch) => void | Promise<void>;
    onKind: (kind: GroupKind) => void | Promise<void>;
    onRoundsChange: (delta: 1 | -1) => void | Promise<void>;
    onUngroup: () => void;
    /** Asks to remove the group and its exercises (the caller confirms). */
    onRemove: () => void;
  }>();

  const kind = $derived(groupKindOf(memberCount, info?.kind));
  const kindWord = $derived(kind === "circuit" ? "circuit" : "superset");
  const defaults = $derived(circuitDefaultsFrom($profile.restDefaults));
  const timing = $derived(resolveGroupTiming(info, memberCount, defaults));
  // Unset = each exercise's own rest timer when sets are ticked by hand (none in the countdown).
  const roundRest = $derived(info?.roundRestMs);

  let nameDraft = $state("");
  let lastOpen = false;
  $effect(() => {
    if (open && !lastOpen) nameDraft = info?.label ?? "";
    lastOpen = open;
  });
  $effect(() => {
    if (!open) return;
    openOverlay();
    return () => closeOverlay();
  });

  const LEAD_OPTIONS = [3_000, 5_000, 10_000];
  const BETWEEN_OPTIONS = [0, 10_000, 15_000, 30_000];
  const ROUND_OPTIONS = [0, 30_000, 60_000, 90_000, 120_000];
  const MAX_REST = 600_000;

  function patch(p: GroupSettingsPatch) {
    void onPatch(p);
  }
  function clampRest(ms: number): number {
    return Math.max(0, Math.min(MAX_REST, ms));
  }
  function setBetween(ms: number) {
    // The default for this kind is stored as "unset", so a later change in Settings applies.
    const kindDefault = kind === "circuit" ? defaults.memberRestMs : 0;
    patch({ memberRestMs: ms === kindDefault ? null : clampRest(ms) });
  }
  function setLead(ms: number) {
    patch({ leadInMs: ms === defaults.leadInMs ? null : ms });
  }
  function setRoundRest(ms: number | null) {
    patch({ roundRestMs: ms === null ? null : clampRest(ms) });
  }
  async function saveName() {
    await onPatch({ label: nameDraft });
  }
  const nameChanged = $derived(nameDraft.trim() !== (info?.label ?? ""));
</script>

{#if open}
  <button
    type="button"
    class="fixed inset-0 bg-black/40 z-40"
    onclick={onClose}
    aria-label="Close"
    transition:fade={{ duration: 150 }}
  ></button>

  <div
    class="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-[500px] flex-col rounded-t-xl border-t border-border bg-background max-h-[88dvh]"
    role="dialog"
    aria-modal="true"
    aria-label="Edit {kindWord}"
    transition:sheetUp
  >
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <div class="min-w-0">
        <p class="text-sm font-semibold truncate">Edit {kindWord}</p>
        <p class="text-xs text-muted-foreground">
          {memberCount} exercise{memberCount === 1 ? "" : "s"} · {rounds} round{rounds === 1 ? "" : "s"}
        </p>
      </div>
      <button type="button" class="h-11 w-11 -mr-3 flex items-center justify-center text-muted-foreground hover:text-foreground" onclick={onClose} aria-label="Close">
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col gap-6">
      <!-- Name -->
      <div class="flex flex-col gap-2">
        <Label for="group-name">Name</Label>
        <div class="flex gap-2">
          <input
            id="group-name"
            class="h-10 flex-1 min-w-0 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={groupLabel(memberCount, undefined, info?.kind)}
            bind:value={nameDraft}
            disabled={saving}
            onkeydown={(e) => { if (e.key === "Enter") void saveName(); }}
          />
          {#if nameChanged}
            <Button size="sm" class="h-10" disabled={saving} onclick={() => void saveName()}>Save</Button>
          {/if}
        </div>
      </div>

      <!-- Type -->
      <div class="flex flex-col gap-2">
        <Label>Type</Label>
        <div class={segmentTrack}>
          <button
            type="button"
            class={segment(kind === "superset")}
            aria-pressed={kind === "superset"}
            disabled={saving || memberCount < 2}
            onclick={() => onKind("superset")}
          >Superset</button>
          <button
            type="button"
            class={segment(kind === "circuit")}
            aria-pressed={kind === "circuit"}
            disabled={saving}
            onclick={() => onKind("circuit")}
          >Circuit</button>
        </div>
        <p class="text-xs text-muted-foreground">
          {kind === "superset"
            ? "One set of each exercise back to back, then rest. Needs two or more exercises."
            : "Round after round of every exercise in order. Can be one exercise for several rounds."}
        </p>
      </div>

      <!-- Rounds -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium">Rounds</p>
          <p class="text-xs text-muted-foreground">{roundsHint}</p>
        </div>
        {@render stepper(
          String(rounds),
          "One round fewer",
          () => onRoundsChange(-1),
          !canRemoveRound,
          "One more round",
          () => onRoundsChange(1),
          false,
        )}
      </div>

      <!-- Get ready (the countdown only runs drills) -->
      {#if hasDrills}
        <div class="flex flex-col gap-2">
          <p class="text-sm font-medium">Get ready before each exercise</p>
          <div class="flex flex-wrap gap-2">
            {#each LEAD_OPTIONS as ms (ms)}
              <button type="button" class={chip(timing.leadInMs === ms)} aria-pressed={timing.leadInMs === ms} disabled={saving} onclick={() => setLead(ms)}>
                {formatRestMs(ms)}
              </button>
            {/each}
          </div>
          <p class="text-xs text-muted-foreground">
            Your default is {formatRestMs(defaults.leadInMs)} (Settings). Changing it here is for this {kindWord} only.
          </p>
        </div>
      {/if}

      <!-- Rest between exercises -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">Rest between exercises</p>
          {@render stepper(
            formatRestMs(timing.memberRestMs),
            "5 seconds less",
            () => setBetween(timing.memberRestMs - 5_000),
            timing.memberRestMs <= 0,
            "5 seconds more",
            () => setBetween(timing.memberRestMs + 5_000),
            timing.memberRestMs >= MAX_REST,
          )}
        </div>
        <div class="flex flex-wrap gap-2">
          {#each BETWEEN_OPTIONS as ms (ms)}
            <button type="button" class={chip(timing.memberRestMs === ms)} aria-pressed={timing.memberRestMs === ms} disabled={saving} onclick={() => setBetween(ms)}>
              {formatRestMs(ms)}
            </button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">
          {kind === "circuit"
            ? `On by default in a circuit (${formatRestMs(defaults.memberRestMs)}, Settings).`
            : "Off by default in a superset: straight on to the next exercise."}
          {hasDrills ? " The countdown rests, then gets you ready." : ""}
        </p>
      </div>

      <!-- Rest between rounds -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{kind === "superset" ? "Rest after each round" : "Rest between rounds"}</p>
          {@render stepper(
            roundRest === undefined ? "Own" : formatRestMs(roundRest),
            "15 seconds less",
            () => setRoundRest((roundRest ?? 0) - 15_000),
            (roundRest ?? 0) <= 0,
            "15 seconds more",
            () => setRoundRest(roundRest === undefined ? 60_000 : roundRest + 15_000),
            (roundRest ?? 0) >= MAX_REST,
          )}
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class={chip(roundRest === undefined)} aria-pressed={roundRest === undefined} disabled={saving} onclick={() => setRoundRest(null)}>
            Exercise's own
          </button>
          {#each ROUND_OPTIONS as ms (ms)}
            <button type="button" class={chip(roundRest === ms)} aria-pressed={roundRest === ms} disabled={saving} onclick={() => setRoundRest(ms)}>
              {formatRestMs(ms)}
            </button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">
          Starts when you tick the last exercise in a round. "Exercise's own" uses that exercise's rest
          timer{hasDrills ? "; the countdown doesn't rest between rounds then" : ""}.
        </p>
      </div>

      {#if estimate && estimate.totalMs > 0}
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-muted px-3 py-2.5">
            <p class="text-xs text-muted-foreground">One round</p>
            <p class="text-base font-semibold tabular-nums">≈ {formatClock(estimate.roundMs)}</p>
          </div>
          <div class="rounded-lg bg-muted px-3 py-2.5">
            <p class="text-xs text-muted-foreground">Whole {kindWord}</p>
            <p class="text-base font-semibold tabular-nums">≈ {formatClock(estimate.totalMs)}</p>
          </div>
        </div>
      {/if}

      <div class="flex flex-col border-t border-border pt-2">
        <button type="button" class="h-11 flex items-center gap-2.5 text-sm text-left disabled:opacity-50" disabled={saving} onclick={onUngroup}>
          <Link2Off class="h-4 w-4" /> Ungroup
        </button>
        <button type="button" class="h-11 flex items-center gap-2.5 text-sm text-left text-destructive disabled:opacity-50" disabled={saving} onclick={onRemove}>
          <Trash2 class="h-4 w-4" /> Remove {kindWord} and its exercises
        </button>
      </div>
    </div>
  </div>
{/if}

{#snippet stepper(
  value: string,
  lessLabel: string,
  less: () => void,
  lessDisabled: boolean,
  moreLabel: string,
  more: () => void,
  moreDisabled: boolean,
)}
  <div class="flex shrink-0 items-center rounded-lg border border-border">
    <button type="button" class="h-10 w-11 flex items-center justify-center disabled:opacity-40" aria-label={lessLabel} disabled={saving || lessDisabled} onclick={less}>
      <Minus class="h-4 w-4" />
    </button>
    <span class="min-w-[52px] text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" class="h-10 w-11 flex items-center justify-center disabled:opacity-40" aria-label={moreLabel} disabled={saving || moreDisabled} onclick={more}>
      <Plus class="h-4 w-4" />
    </button>
  </div>
{/snippet}
