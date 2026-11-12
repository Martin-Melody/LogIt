<script lang="ts">
  // The workout's "Edit circuit / superset" sheet: GroupSettingsSheet fed from the
  // group's blocks, with each change applied to the workout.
  import type { GroupKind, GroupSettingsPatch, SessionBlock, WorkoutSession } from "@logit/core/domain/workout";
  import {
    addSupersetRound,
    blockGroup,
    canRemoveSupersetRound,
    removeSupersetRound,
    setGroupKind,
    setGroupSettings,
    supersetRoundCount,
  } from "@logit/core/domain/workout";
  import { estimateCircuitMs } from "@logit/core/domain/circuit";
  import { profile } from "$lib/stores/profile.store";
  import { circuitDefaultsFrom } from "$lib/features/session/circuit/circuitSettings";
  import GroupSettingsSheet from "./GroupSettingsSheet.svelte";

  const {
    open = false,
    supersetId,
    blocks,
    saving = false,
    onClose,
    onMutate,
    onUngroup,
    onRemove,
  } = $props<{
    open?: boolean;
    supersetId: string;
    blocks: SessionBlock[];
    saving?: boolean;
    onClose: () => void;
    onMutate: (updater: (s: WorkoutSession) => WorkoutSession) => Promise<void>;
    onUngroup: () => void;
    /** Asks to remove the group and its exercises (the caller confirms). */
    onRemove: () => void;
  }>();

  const info = $derived(blocks[0] ? blockGroup(blocks[0]) : undefined);
  const hasDrills = $derived(blocks.some((b: SessionBlock) => b.type === "mobility"));
  const defaults = $derived(circuitDefaultsFrom($profile.restDefaults));
  const estimate = $derived(hasDrills ? estimateCircuitMs({ blocks }, supersetId, defaults) : null);
</script>

<GroupSettingsSheet
  {open}
  {info}
  memberCount={blocks.length}
  rounds={supersetRoundCount(blocks)}
  {hasDrills}
  canRemoveRound={canRemoveSupersetRound({ blocks } as WorkoutSession, supersetId)}
  roundsHint="Fewer only drops sets you haven't logged"
  {estimate}
  {saving}
  {onClose}
  onPatch={(p: GroupSettingsPatch) => onMutate((s: WorkoutSession) => setGroupSettings(s, supersetId, p))}
  onKind={(k: GroupKind) => onMutate((s: WorkoutSession) => setGroupKind(s, supersetId, k))}
  onRoundsChange={(d: 1 | -1) =>
    onMutate((s: WorkoutSession) => (d > 0 ? addSupersetRound(s, supersetId) : removeSupersetRound(s, supersetId)))}
  {onUngroup}
  {onRemove}
/>
