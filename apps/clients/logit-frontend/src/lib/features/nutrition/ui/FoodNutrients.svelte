<script lang="ts">
import { Separator } from "$lib/components/ui/separator/index.js";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { ChevronDown, Info } from "lucide-svelte";
  import {
    LABEL_NUTRIENT_IDS,
    MICRO_NUTRIENT_IDS,
    formatNutrient,
    hasLabelNutrients,
    hasMicros,
    nutrientDef,
    percentOfDaily,
    type Nutrients,
  } from "@logit/core/domain/nutrition";
  import { cn } from "./style";

  // A food's other nutrients for the amount chosen. `part="label"` is the row of four from the
  // pack (fibre, sugar, sat fat, salt) that sits under the macros; `part="micros"` is the
  // vitamins and minerals list, folded by default and remembered once opened.
  interface Props {
    nutrients: Nutrients | undefined;
    part: "label" | "micros";
    /** A packaged product: says so when its label has no vitamins. */
    packaged?: boolean;
  }
  const { nutrients, part, packaged = false }: Props = $props();

  const OPEN_KEY = "logit:nutrition:microsOpen:v1";
  function readOpen(): boolean {
    try {
      return getAccountItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  }
  let open = $state(readOpen());
  function toggle() {
    open = !open;
    try {
      setAccountItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  const SHORT: Record<string, string> = { fibreG: "fibre", sugarG: "sugar", satFatG: "sat fat", saltG: "salt" };

  const micros = $derived(
    MICRO_NUTRIENT_IDS.flatMap((id) => {
      const v = nutrients?.[id];
      if (v === undefined) return [];
      const pct = percentOfDaily(id, v) ?? 0;
      return [{ id, name: nutrientDef(id).name, value: formatNutrient(id, v), pct }];
    }).sort((a, b) => b.pct - a.pct),
  );
  const shown = $derived(micros.filter((m) => m.pct > 0));
  const none = $derived(micros.filter((m) => m.pct === 0).map((m) => m.name));
</script>

{#if part === "label"}
  {#if hasLabelNutrients(nutrients)}
    <Separator class="my-3" />
    <div class="grid grid-cols-4 gap-2 text-center" data-testid="label-nutrients">
      {#each LABEL_NUTRIENT_IDS as id (id)}
        {@const v = nutrients?.[id]}
        <div>
          <div class="text-sm font-semibold tabular-nums">{v === undefined ? "–" : formatNutrient(id, v)}</div>
          <div class="text-[11px] text-muted-foreground">{SHORT[id]}</div>
        </div>
      {/each}
    </div>
  {/if}
{:else if hasMicros(nutrients)}
  <div class="mx-4 mt-2.5 overflow-hidden rounded-2xl bg-muted/60 dark:bg-background">
    <button
      type="button"
      class="flex min-h-12 w-full items-center gap-2.5 px-4 text-left"
      aria-expanded={open}
      onclick={toggle}
    >
      <span class="flex-1 text-[13px] font-semibold">Vitamins &amp; minerals</span>
      <span class="text-xs text-muted-foreground">% of daily amount</span>
      <ChevronDown class={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
    </button>
    {#if open}
      <div class="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-3.5" data-testid="micro-nutrients">
        {#each shown as m (m.id)}
          <div>
            <div class="flex justify-between gap-1.5 text-xs">
              <span>{m.name}</span><span class="font-semibold tabular-nums">{m.pct}%</span>
            </div>
            <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full bg-foreground/80" style="width: {Math.min(m.pct, 100)}%"></div>
            </div>
            <div class="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{m.value}</div>
          </div>
        {/each}
      </div>
      {#if none.length > 0}
        <p class="px-4 pb-3.5 text-[11px] text-muted-foreground">None or next to none: {none.join(", ")}.</p>
      {/if}
    {/if}
  </div>
{:else if packaged}
  <div class="mx-4 mt-2.5 flex items-start gap-2.5 rounded-2xl bg-muted/60 px-4 py-3 dark:bg-background">
    <Info class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    <p class="text-xs leading-relaxed text-muted-foreground">
      This product's label doesn't list vitamins or minerals, so it won't count toward them in your day.
    </p>
  </div>
{/if}
