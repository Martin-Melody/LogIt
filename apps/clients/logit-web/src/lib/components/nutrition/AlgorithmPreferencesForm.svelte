<script lang="ts">
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
        {#if field.description}<p class="text-xs text-muted-foreground mt-0.5 mb-2">{field.description}</p>{/if}
        <div class="flex rounded border border-border overflow-hidden text-xs w-full">
          {#each field.options as opt (opt.value)}
            <button
              type="button"
              class="flex-1 px-3 py-1.5 text-center {getStr(field.key) === String(opt.value)
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'}"
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
            {#if field.description}<p class="text-xs text-muted-foreground mt-0.5">{field.description}</p>{/if}
          </div>
          {#if field.type === "boolean"}
            <button
              type="button"
              role="switch"
              aria-label={field.label}
              aria-checked={getBool(field.key)}
              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {getBool(field.key) ? 'bg-primary' : 'bg-input'}"
              onclick={() => onChange(field.key, !getBool(field.key))}
            >
              <span class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform {getBool(field.key) ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
          {:else if field.type === "number" || field.type === "range"}
            <div class="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={getNum(field.key)}
                class="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                onchange={(e) => onChange(field.key, Number((e.target as HTMLInputElement).value))}
              />
              {#if field.unit}<span class="text-xs text-muted-foreground">{field.unit}</span>{/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
