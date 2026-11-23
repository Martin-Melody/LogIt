<!-- Settings › Insights: how muscle-group sweet spots and progress charts are worked out. -->
<script lang="ts">
  import { onMount } from "svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection from "$lib/features/settings/SettingsSection.svelte";
  import AlgorithmPicker from "$lib/features/settings/AlgorithmPicker.svelte";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import {
    getMuscleGroupInsightConfig,
    setMuscleGroupInsightAlgorithm,
    DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID,
    type MuscleGroupInsightConfigView,
  } from "@logit/core/usecases/progression/getMuscleGroupInsightConfig";
  import {
    getAnalyticsConfig,
    setAnalyticsPlugin,
    DEFAULT_ANALYTICS_ID,
    type AnalyticsConfigView,
  } from "@logit/core/usecases/progression/getAnalyticsConfig";

  // --- Muscle group insight (§5 option B) ---
  const mgUi = $state({ loading: true, saving: false, error: null as string | null });
  let mgView = $state<MuscleGroupInsightConfigView>({ config: null, activeAlgorithmId: DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID, algorithms: [] });

  async function selectMuscleGroup(id: string) {
    if (mgUi.saving) return;
    mgUi.saving = true;
    mgUi.error = null;
    try {
      await setMuscleGroupInsightAlgorithm(id, getProgressionDeps());
      mgView = {
        ...mgView,
        config: id && id !== DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID ? { algorithmId: id } : null,
        activeAlgorithmId: id || DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID,
      };
    } catch (e) {
      mgUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      mgUi.saving = false;
    }
  }

  // --- Analytics ---
  const anUi = $state({ loading: true, saving: false, error: null as string | null });
  let anView = $state<AnalyticsConfigView>({ config: null, plugins: [] });

  async function selectAnalytics(id: string) {
    if (anUi.saving) return;
    anUi.saving = true;
    anUi.error = null;
    try {
      await setAnalyticsPlugin(id, getProgressionDeps());
      anView = { ...anView, config: id ? { analyticsId: id } : null };
    } catch (e) {
      anUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      anUi.saving = false;
    }
  }

  onMount(() => {
    void getMuscleGroupInsightConfig(getProgressionDeps())
      .then((v) => (mgView = v))
      .catch((e) => (mgUi.error = e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => (mgUi.loading = false));
    void getAnalyticsConfig(getProgressionDeps())
      .then((v) => (anView = v))
      .catch((e) => (anUi.error = e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => (anUi.loading = false));
  });
</script>

<SettingsPage title="Insights">
  <SettingsSection id="muscle-groups" title="Muscle groups" note="How the app learns your own volume and frequency sweet spot for each muscle group.">
    <AlgorithmPicker algorithms={mgView.algorithms} activeId={mgView.activeAlgorithmId} saving={mgUi.saving}
      loading={mgUi.loading} error={mgUi.error} onselect={(id) => void selectMuscleGroup(id)}
      settingsHref={(a) => (a.hasPreferences ? `/settings/muscle-group-insight/${a.id}` : null)} />
  </SettingsSection>

  <SettingsSection id="analytics" title="Analytics" note="How your progress numbers and charts are worked out.">
    <AlgorithmPicker algorithms={anView.plugins} activeId={anView.config?.analyticsId ?? DEFAULT_ANALYTICS_ID} saving={anUi.saving}
      loading={anUi.loading} error={anUi.error} onselect={(id) => void selectAnalytics(id)} />
  </SettingsSection>
</SettingsPage>
