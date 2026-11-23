<!-- Settings › Mobility: how stretching drills progress, drills set on their own, and which side first. -->
<script lang="ts">
  import { onMount } from "svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection from "$lib/features/settings/SettingsSection.svelte";
  import AlgorithmPicker from "$lib/features/settings/AlgorithmPicker.svelte";
  import { Button } from "$lib/components/ui/button";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { profile } from "$lib/stores/profile.store";
  import { pushExerciseSetting } from "$lib/sync/syncService";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { listMobilityDrillSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { setMobilityDrillAlgorithm } from "@logit/core/usecases/progression/getMobilitySuggestion";
  import type { ExerciseProgressionSettings } from "@logit/core/domain/progression";
  import {
    getMobilityProgressionConfig,
    setMobilityProgressionAlgorithm,
    DEFAULT_MOBILITY_ALGORITHM_ID,
    type MobilityProgressionConfigView,
  } from "@logit/core/usecases/progression/getMobilityProgressionConfig";

  const ui = $state({ loading: true, saving: false, error: null as string | null });
  let view = $state<MobilityProgressionConfigView>({ config: null, activeAlgorithmId: DEFAULT_MOBILITY_ALGORITHM_ID, algorithms: [] });

  // Drills given their own algorithm from their card ("Keep it the same").
  let drillRows = $state<ExerciseProgressionSettings[]>([]);
  async function resetDrill(row: ExerciseProgressionSettings) {
    const reset = await setMobilityDrillAlgorithm({ name: row.exerciseName, id: row.key.slice("mobility::".length) }, null, getProgressionDeps());
    if (reset) pushExerciseSetting(reset);
    drillRows = drillRows.filter((r) => r.key !== row.key);
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      drillRows = await listMobilityDrillSettings(getProgressionDeps()).catch(() => []);
      view = await getMobilityProgressionConfig(getProgressionDeps());
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      ui.loading = false;
    }
  }

  async function select(id: string) {
    if (ui.saving) return;
    ui.saving = true;
    ui.error = null;
    try {
      await setMobilityProgressionAlgorithm(id, getProgressionDeps());
      view = {
        ...view,
        config: id && id !== DEFAULT_MOBILITY_ALGORITHM_ID ? { algorithmId: id } : null,
        activeAlgorithmId: id || DEFAULT_MOBILITY_ALGORITHM_ID,
      };
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      ui.saving = false;
    }
  }

  onMount(() => void load());
</script>

<SettingsPage title="Mobility">
  <p class="px-1 text-sm leading-relaxed text-muted-foreground">
    Drills progress by default. Would you rather do the same holds every time, like 30 seconds each? Pick
    <strong class="font-medium text-foreground">Same every time</strong> here for every drill, or tap
    <strong class="font-medium text-foreground">Keep it the same</strong> on one drill in a workout.
  </p>

  <SettingsSection title="How drills progress">
    <AlgorithmPicker algorithms={view.algorithms} activeId={view.activeAlgorithmId} saving={ui.saving}
      loading={ui.loading} error={ui.error} onselect={(id) => void select(id)}
      settingsHref={(a) => (a.hasPreferences ? `/settings/mobility-progression/${a.id}` : null)} />
  </SettingsSection>

  {#if drillRows.length}
    <SettingsSection title="Drills set on their own">
      {#each drillRows as row (row.key)}
        {@const algo = view.algorithms.find((a) => a.id === row.algorithmId)}
        <div class="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
          <span class="flex min-w-0 flex-col"><span class="truncate text-[15px]">{row.exerciseName}</span><span class="text-[13px] text-muted-foreground">{algo?.name ?? row.algorithmId}</span></span>
          <Button size="sm" variant="outline" onclick={() => void resetDrill(row)}>Like the rest</Button>
        </div>
      {/each}
    </SettingsSection>
  {/if}

  <SettingsSection id="lead-side" title="One-sided drills" note="Which side you do first. Change it for one set from that set's edit sheet.">
    <div class="flex min-h-14 items-center px-3 py-2.5">
      <div class={segmentTrack}>
        {#each [{ v: "left", t: "Left first" }, { v: "right", t: "Right first" }] as opt (opt.v)}
          <button type="button" class={segment($profile.mobilityLeadSide === opt.v)} aria-pressed={$profile.mobilityLeadSide === opt.v}
            onclick={() => profile.save({ mobilityLeadSide: opt.v as "left" | "right" })}>{opt.t}</button>
        {/each}
      </div>
    </div>
  </SettingsSection>
</SettingsPage>
