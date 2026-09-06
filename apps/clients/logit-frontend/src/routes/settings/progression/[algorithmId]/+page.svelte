<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import AlgorithmPreferencesForm from "$lib/components/AlgorithmPreferencesForm.svelte";
  import { getAlgorithmRegistry, getProgressionRepo } from "$lib/data/repoProvider";
  import type { ProgressionAlgorithm, AlgorithmPreferencesField } from "@logit/core/domain/progression";

  const algorithmId = $derived($page.params.algorithmId ?? "");

  let algorithm = $state<ProgressionAlgorithm | null>(null);
  let prefs = $state<Record<string, unknown>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const [algo, stored] = await Promise.all([
        getAlgorithmRegistry().get(algorithmId),
        getProgressionRepo().getAlgorithmPreferences(algorithmId),
      ]);

      if (!algo) { error = "Algorithm not found."; return; }
      algorithm = algo;

      const defaults = buildDefaults(algo.preferencesSchema ?? []);
      prefs = { ...defaults, ...(stored as Record<string, unknown> ?? {}) };
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load preferences.";
    } finally {
      loading = false;
    }
  });

  function buildDefaults(schema: AlgorithmPreferencesField[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of schema) out[field.key] = field.default;
    return out;
  }

  async function save() {
    try {
      await getProgressionRepo().setAlgorithmPreferences(algorithmId, prefs);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save.";
    }
  }

  function setValue(key: string, value: unknown) {
    prefs = { ...prefs, [key]: value };
    void save();
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => back("/settings")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-base font-semibold">
      {algorithm?.name ?? "Algorithm"} Settings
    </h1>
  </div>

  {#if loading}
    <p class="text-sm text-muted-foreground p-1">Loading…</p>
  {:else if error}
    <p class="text-sm text-destructive p-1">{error}</p>
  {:else if algorithm?.preferencesSchema?.length}
    <Card.Root>
      <Card.Header>
        <Card.Title>Preferences</Card.Title>
        <Card.Description>
          These settings are passed to the algorithm when it generates suggestions.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <AlgorithmPreferencesForm
          schema={algorithm.preferencesSchema}
          values={prefs}
          onChange={setValue}
        />
      </Card.Content>
    </Card.Root>

    <button
      type="button"
      class="text-xs text-muted-foreground/60 hover:text-muted-foreground self-start transition-colors"
      onclick={async () => {
        prefs = buildDefaults(algorithm?.preferencesSchema ?? []);
        await save();
      }}
    >
      Reset to defaults
    </button>
  {:else}
    <p class="text-sm text-muted-foreground p-1">This algorithm has no configurable preferences.</p>
  {/if}
</div>
