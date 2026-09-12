<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Info } from "lucide-svelte";
  import type { Reasoning, ReasoningConfidence } from "@logit/core/domain/reasoning";

  const { reasoning, triggerLabel = "Why?" }: { reasoning: Reasoning; triggerLabel?: string } =
    $props();

  let open = $state(false);

  const CONFIDENCE_META: Record<ReasoningConfidence, { label: string; class: string }> = {
    low: {
      label: "Low confidence — not much data yet",
      class: "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10",
    },
    medium: {
      label: "Medium confidence",
      class: "text-sky-600 dark:text-sky-400 border-sky-500/40 bg-sky-500/10",
    },
    high: {
      label: "High confidence",
      class: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    },
  };

  // camelCase -> "Camel case" for display, without a dependency.
  function formatKey(key: string): string {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function formatValue(value: unknown): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(Math.round(value * 100) / 100);
    return String(value);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    class="inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
  >
    <Info class="h-3 w-3" />
    {triggerLabel}
  </Dialog.Trigger>

  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Why "{reasoning.verdict}"?</Dialog.Title>
      <Dialog.Description>What this looked at and computed to reach that.</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 text-sm">
      <span
        class="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium {CONFIDENCE_META[
          reasoning.confidence
        ].class}"
      >
        {CONFIDENCE_META[reasoning.confidence].label}
      </span>

      {#if Object.keys(reasoning.inputs).length > 0}
        <div>
          <p class="text-xs font-medium text-muted-foreground mb-1">Looked at</p>
          <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            {#each Object.entries(reasoning.inputs) as [key, value] (key)}
              <dt class="text-muted-foreground">{formatKey(key)}</dt>
              <dd class="text-right tabular-nums">{formatValue(value)}</dd>
            {/each}
          </dl>
        </div>
      {/if}

      {#if Object.keys(reasoning.computed).length > 0}
        <div>
          <p class="text-xs font-medium text-muted-foreground mb-1">Computed</p>
          <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            {#each Object.entries(reasoning.computed) as [key, value] (key)}
              <dt class="text-muted-foreground">{formatKey(key)}</dt>
              <dd class="text-right tabular-nums">{formatValue(value)}</dd>
            {/each}
          </dl>
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
