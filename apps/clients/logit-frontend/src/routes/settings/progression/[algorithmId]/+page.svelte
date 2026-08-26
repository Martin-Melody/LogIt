<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { getAlgorithmRegistry, getProgressionRepo } from "$lib/data/repoProvider";
  import type { ProgressionAlgorithm, AlgorithmPreferencesField } from "@logit/core/domain/progression";

  const algorithmId = $derived($page.params.algorithmId);

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

  function getNum(key: string): number {
    return typeof prefs[key] === "number" ? (prefs[key] as number) : 0;
  }

  function getBool(key: string): boolean {
    return prefs[key] === true;
  }

  function getStr(key: string): string {
    return typeof prefs[key] === "string" ? (prefs[key] as string) : "";
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
      <Card.Content class="flex flex-col gap-0">
        {#each algorithm.preferencesSchema as field, i (field.key)}
          <div class="py-3 {i > 0 ? 'border-t border-border' : ''}">
            {#if field.type === "select" && field.options}
              <!-- Select: label/description stacked above the options -->
              <p class="text-sm font-medium">{field.label}</p>
              {#if field.description}
                <p class="text-xs text-muted-foreground mt-0.5 mb-2">{field.description}</p>
              {/if}
              <div class="flex rounded border overflow-hidden text-xs w-full">
                {#each field.options as opt (opt.value)}
                  <button
                    type="button"
                    class="flex-1 px-3 py-1.5 text-center transition-colors {getStr(field.key) === String(opt.value) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
                    onclick={() => setValue(field.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            {:else}
              <!-- Boolean / number / range: label+description on left, control on right -->
              <div class="flex items-center justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">{field.label}</p>
                  {#if field.description}
                    <p class="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  {/if}
                </div>

                {#if field.type === "boolean"}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={getBool(field.key)}
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {getBool(field.key) ? 'bg-primary' : 'bg-input'}"
                    onclick={() => setValue(field.key, !getBool(field.key))}
                  >
                    <span class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform {getBool(field.key) ? 'translate-x-4' : 'translate-x-0'}"></span>
                  </button>
                {:else if field.type === "number" || field.type === "range"}
                  <div class="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step ?? 1}
                      value={getNum(field.key)}
                      class="w-20 rounded border bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      onchange={(e) => setValue(field.key, Number((e.target as HTMLInputElement).value))}
                    />
                    {#if field.unit}
                      <span class="text-xs text-muted-foreground">{field.unit}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
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
