<script lang="ts">
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import type { AlgorithmPreferencesField } from "@logit/core/domain/progression";

  let {
    schema,
    values,
    onChange,
  }: {
    schema: AlgorithmPreferencesField[];
    values: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
  } = $props();

  const getNum = (key: string) => (typeof values[key] === "number" ? (values[key] as number) : 0);
  const getBool = (key: string) => values[key] === true;
  const getStr = (key: string) => (typeof values[key] === "string" ? (values[key] as string) : "");
</script>

<div class="flex flex-col">
  {#each schema as field, i (field.key)}
    <div class="py-3 {i > 0 ? 'border-t border-border' : ''}">
      {#if field.type === "select" && field.options}
        <p class="text-sm font-medium">{field.label}</p>
        {#if field.description}
          <p class="text-xs text-muted-foreground mt-0.5 mb-2">{field.description}</p>
        {/if}
        <div class={cn(segmentTrack, "w-full")}>
          {#each field.options as opt (opt.value)}
            <button
              type="button"
              class={segment(getStr(field.key) === String(opt.value))} aria-pressed={getStr(field.key) === String(opt.value)}
              onclick={() => onChange(field.key, opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">{field.label}</p>
            {#if field.description}
              <p class="text-xs text-muted-foreground mt-0.5">{field.description}</p>
            {/if}
          </div>

          {#if field.type === "boolean"}
            <Switch checked={getBool(field.key)} label={field.label} onchange={() => onChange(field.key, !getBool(field.key))} />
          {:else if field.type === "number" || field.type === "range"}
            <div class="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={getNum(field.key)}
                class="h-10 w-20 rounded-md border bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                onchange={(e) => onChange(field.key, Number((e.target as HTMLInputElement).value))}
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
</div>
