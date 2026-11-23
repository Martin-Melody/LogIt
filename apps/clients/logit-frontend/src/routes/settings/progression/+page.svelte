<!-- Settings › Progression: how the next weights and reps are worked out, your own algorithms,
     and exercises set differently. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection from "$lib/features/settings/SettingsSection.svelte";
  import AlgorithmPicker from "$lib/features/settings/AlgorithmPicker.svelte";
  import AddRecipeFromCodeSheet from "$lib/features/progression/AddRecipeFromCodeSheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { bumpProgression } from "$lib/progression/store";
  import { getProgressionConfig, setProgressionAlgorithm, type ProgressionConfigView } from "@logit/core/usecases/progression/getProgressionConfig";
  import { listExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { PROGRESSION_OFF, type ExerciseProgressionSettings } from "@logit/core/domain/progression";

  const progUi = $state({ loading: true, saving: false, error: null as string | null });
  let view = $state<ProgressionConfigView>({ config: null, algorithms: [] });
  let exerciseOverrides = $state<ExerciseProgressionSettings[]>([]);
  let addingFromCode = $state(false);
  let codeFromLink = $state("");
  // Opened from a shared algorithm's link: show it, ready to add.
  $effect(() => {
    const code = page.url.searchParams.get("algorithmCode");
    if (!code) return;
    codeFromLink = code;
    addingFromCode = true;
    const url = new URL(page.url);
    url.searchParams.delete("algorithmCode");
    void goto(url.pathname + url.search + url.hash, { replaceState: true, noScroll: true, keepFocus: true });
  });

  /** "Rep range 3–5 · LogIt Adaptive · pushes when behind" */
  function overrideSummary(s: ExerciseProgressionSettings): string {
    const parts: string[] = [];
    if (s.repRange) parts.push(`${s.repRange[0]}–${s.repRange[1]} reps`);
    if (s.algorithmId === PROGRESSION_OFF) parts.push("No suggestions");
    else if (s.algorithmId) parts.push(view.algorithms.find((a) => a.id === s.algorithmId)?.name ?? "Removed algorithm");
    if (s.behindPace === "push") parts.push("pushes when behind on its goal");
    return parts.join(" · ");
  }

  async function loadProgression() {
    progUi.loading = true;
    progUi.error = null;
    try {
      view = await getProgressionConfig(getProgressionDeps());
      exerciseOverrides = (await listExerciseProgressionSettings(getProgressionDeps())).sort((a, b) =>
        a.exerciseName.localeCompare(b.exerciseName),
      );
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      progUi.loading = false;
    }
  }

  async function selectAlgorithm(id: string) {
    if (progUi.saving) return;
    progUi.saving = true;
    progUi.error = null;
    try {
      await setProgressionAlgorithm(id, getProgressionDeps());
      view = { ...view, config: id ? { algorithmId: id } : null };
      // Tells the Home screen's Progression widget to reload; nothing else would until the next sync.
      bumpProgression();
    } catch (e) {
      progUi.error = e instanceof Error ? e.message : "Failed to save setting";
    } finally {
      progUi.saving = false;
    }
  }

  onMount(() => void loadProgression());
</script>

<SettingsPage title="Progression">
  <SettingsSection title="Algorithm" note="How the app suggests weights and reps for your next session.">
    <AlgorithmPicker algorithms={view.algorithms} activeId={view.config?.algorithmId} saving={progUi.saving}
      loading={progUi.loading} error={progUi.error} onselect={(id) => void selectAlgorithm(id)}
      settingsHref={(a) => a.id.startsWith("recipe:")
        ? `/settings/progression/build/${a.id.slice("recipe:".length)}`
        : a.hasPreferences ? `/settings/progression/${a.id}` : null} />
  </SettingsSection>

  {#if !progUi.loading}
    <div id="build" class="flex scroll-mt-4 flex-wrap gap-2">
      <Button variant="outline" onclick={() => goto("/settings/progression/build/new")}>Build an algorithm</Button>
      <Button variant="outline" onclick={() => (addingFromCode = true)}>Add from a code</Button>
      {#if view.config}
        <Button variant="ghost" class="text-muted-foreground" disabled={progUi.saving} onclick={() => void selectAlgorithm("")}>
          Disable suggestions
        </Button>
      {/if}
    </div>

    <div data-testid="exercise-overrides">
      {#if exerciseOverrides.length}
        <SettingsSection id="overrides" title="Exercises set differently">
          {#each exerciseOverrides as o (o.key)}
            <a href={o.exerciseId ? `/exercises/${o.exerciseId}?tab=settings` : undefined}
              class="flex min-h-14 flex-col justify-center px-3 py-2 text-inherit no-underline hover:bg-muted/40">
              <span class="text-[15px] font-medium">{o.exerciseName}</span>
              <span class="text-[13px] text-muted-foreground">{overrideSummary(o)}</span>
            </a>
          {/each}
        </SettingsSection>
      {:else}
        <section id="overrides" class="scroll-mt-4 px-1">
          <h2 class="pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exercises set differently</h2>
          <p class="text-[13px] leading-snug text-muted-foreground">None yet. Open an exercise and use How it progresses to give it its own rep range or algorithm.</p>
        </section>
      {/if}
    </div>
  {/if}
</SettingsPage>

{#if addingFromCode}
  <AddRecipeFromCodeSheet
    initialText={codeFromLink}
    onclose={() => {
      addingFromCode = false;
      codeFromLink = "";
    }}
    onadded={() => void loadProgression()}
  />
{/if}
