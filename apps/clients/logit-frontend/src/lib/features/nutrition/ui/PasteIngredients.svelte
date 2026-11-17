<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { AlertTriangle, LoaderCircle, X } from "lucide-svelte";
  import { parseIngredientList, scaleMacros } from "@logit/core/domain/nutrition";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { loadMyFoods, matchIngredientLine, sizeLine, type MatchedLine } from "../foodFinder";
  import { fmtNum } from "./meals";
  import IngredientPicker from "./IngredientPicker.svelte";
  import AmountSheet, { type AmountResult } from "./AmountSheet.svelte";

  // Paste a recipe's ingredient list ("500 g chicken breast", "2 tins chopped tomatoes"),
  // get a best match for each line, fix any that are wrong, add them all.
  interface Props {
    onadd: (lines: MatchedLine[]) => void;
    onclose: () => void;
  }
  const { onadd, onclose }: Props = $props();

  let text = $state("");
  let phase = $state<"paste" | "matching" | "review">("paste");
  let lines = $state<MatchedLine[]>([]);
  let skip = $state<Set<number>>(new Set());
  let changing = $state<number | null>(null);
  let sizing = $state<number | null>(null);

  onMount(() => {
    openOverlay();
    return () => closeOverlay();
  });

  async function match() {
    const parsed = parseIngredientList(text);
    if (parsed.length === 0) return;
    phase = "matching";
    const mine = await loadMyFoods();
    lines = await Promise.all(parsed.map((l) => matchIngredientLine(l, mine)));
    skip = new Set();
    phase = "review";
  }

  const ready = $derived(lines.filter((l, i) => !skip.has(i) && l.food && l.grams && l.grams > 0));
  const needsWork = $derived(lines.filter((l, i) => !skip.has(i) && !(l.food && l.grams && l.grams > 0)).length);

  function kcalOf(l: MatchedLine): number | null {
    return l.food && l.grams ? scaleMacros(l.food.per100g, l.grams).kcal : null;
  }

  function toggleSkip(i: number) {
    const next = new Set(skip);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    skip = next;
  }

  function setSize(i: number, r: AmountResult) {
    lines[i] = { ...lines[i], grams: r.grams, label: r.label, amount: r.amount, portionId: r.portionId };
    sizing = null;
  }
</script>

{#if changing !== null}
  {@const i = changing}
  <IngredientPicker
    title={lines[i].line.name}
    onpick={(p) => {
      lines[i] = sizeLine(lines[i].line, p.food);
      changing = null;
      if (!lines[i].grams) sizing = i;
    }}
    onclose={() => (changing = null)}
  />
{/if}
{#if sizing !== null && lines[sizing]?.food}
  {@const i = sizing}
  <AmountSheet
    food={lines[i].food!}
    subtitle={lines[i].line.text}
    initial={{ amount: lines[i].amount, portionId: lines[i].portionId, grams: lines[i].grams ?? undefined }}
    meal={null}
    confirmText={() => "Use this amount"}
    onconfirm={(r) => setSize(i, r)}
    onclose={() => (sizing = null)}
  />
{/if}

<div
  class="fixed inset-0 z-40 flex flex-col bg-background pt-[env(safe-area-inset-top)]"
  role="dialog"
  aria-modal="true"
  aria-label="Paste ingredients"
  transition:fly={{ y: 24, duration: 180 }}
>
  <div class="flex h-14 shrink-0 items-center gap-1 px-1">
    <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={onclose}>
      <X class="size-5" />
    </button>
    <h1 class="flex-1 text-lg font-bold">Paste ingredients</h1>
  </div>

  {#if phase !== "review"}
    <div class="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
      <p class="text-sm text-muted-foreground">One ingredient per line, amount first. "500 g chicken breast", "2 tins chopped tomatoes", "1 tbsp olive oil", "3 eggs".</p>
      <textarea
        class="min-h-0 flex-1 resize-none rounded-xl bg-muted p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        placeholder={"1.5 kg beef mince\n2 onions\n3 tins chopped tomatoes\n2 tins kidney beans\n1 tbsp olive oil"}
        bind:value={text}
        aria-label="Ingredient list"
      ></textarea>
      <button
        type="button"
        class="flex h-13 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        disabled={!text.trim() || phase === "matching"}
        onclick={() => void match()}
      >
        {#if phase === "matching"}<LoaderCircle class="size-5 animate-spin" />Finding foods…{:else}Find these foods{/if}
      </button>
    </div>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <p class="px-1 pb-2 text-sm text-muted-foreground">Check each match. Tap one to change the food, or its amount to fix it.</p>
      <ul class="overflow-hidden rounded-2xl border border-border bg-card dark:border-transparent">
        {#each lines as l, i (i)}
          {@const kcal = kcalOf(l)}
          {@const off = skip.has(i)}
          <li class="border-t border-border px-3.5 py-2.5 first:border-t-0 {off ? 'opacity-45' : ''}">
            <div class="flex items-start gap-2">
              <span class="min-w-0 flex-1 text-xs text-muted-foreground">{l.line.text}</span>
              <button type="button" class="shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-2" onclick={() => toggleSkip(i)}>{off ? "Include" : "Skip"}</button>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <button type="button" class="min-w-0 flex-1 text-left" onclick={() => (changing = i)} disabled={off}>
                {#if l.food}
                  <span class="block truncate font-medium">{l.food.name}</span>
                  {#if l.food.brand}<span class="block truncate text-xs text-muted-foreground">{l.food.brand}</span>{/if}
                {:else}
                  <span class="flex items-center gap-1.5 font-medium text-warning"><AlertTriangle class="size-4" />No match, tap to search</span>
                {/if}
              </button>
              {#if l.food}
                <button
                  type="button"
                  class="h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-semibold tabular-nums {l.grams ? 'bg-muted' : 'bg-warning/15 text-warning'}"
                  onclick={() => (sizing = i)}
                  disabled={off}
                >{l.label}</button>
                <span class="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{kcal !== null ? fmtNum(kcal) : "–"}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
    <div class="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {#if needsWork > 0}
        <p class="pb-2 text-center text-xs text-warning">{needsWork} line{needsWork === 1 ? "" : "s"} still need a food or an amount (or skip them).</p>
      {/if}
      <button
        type="button"
        class="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        disabled={ready.length === 0}
        onclick={() => onadd(ready)}
      >
        Add {ready.length} ingredient{ready.length === 1 ? "" : "s"}
      </button>
    </div>
  {/if}
</div>
