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
      label: "Not much data yet, so take this lightly",
      class: "text-warning border-warning/40 bg-warning/10",
    },
    medium: {
      label: "Fairly sure",
      class: "text-info border-info/40 bg-info/10",
    },
    high: {
      label: "Based on plenty of sessions",
      class: "text-success border-success/40 bg-success/10",
    },
  };

  const hasNumbers = $derived(
    Object.keys(reasoning.inputs).length > 0 || Object.keys(reasoning.computed).length > 0,
  );
  const summary = $derived(reasoning.summary?.filter(Boolean) ?? []);
  // Short verdicts read as a title ("Why progressing?"); long ones go in the body.
  const shortVerdict = $derived(reasoning.verdict.length <= 24);

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
      <Dialog.Title>{shortVerdict ? `Why ${reasoning.verdict}?` : "Why this suggestion?"}</Dialog.Title>
      {#if !shortVerdict}
        <Dialog.Description class="first-letter:uppercase">{reasoning.verdict}</Dialog.Description>
      {/if}
    </Dialog.Header>

    <div class="flex flex-col gap-3 text-sm">
      <span
        class="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium {CONFIDENCE_META[
          reasoning.confidence
        ].class}"
      >
        {CONFIDENCE_META[reasoning.confidence].label}
      </span>

      {#if summary.length > 0}
        <ul class="flex flex-col gap-1.5 text-sm leading-snug">
          {#each summary as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}

      {#if hasNumbers}
        <details class="group text-xs" open={summary.length === 0}>
          <summary class="cursor-pointer select-none text-muted-foreground hover:text-foreground">Show the numbers</summary>
          <div class="mt-2 flex flex-col gap-3">
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
        </details>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
