<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { fly } from "svelte/transition";
  import { AlertTriangle, Check, Plus, ScanBarcode, ScanText, X } from "lucide-svelte";
  import {
    createCustomFood,
    gramServing,
    kcalFromMacros,
    updateCustomFood,
    type CustomFood,
    type ServingOption,
  } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushCustomFood } from "$lib/sync/syncService";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { toast } from "$lib/components/ui/sonner";
  import LabelScanner from "../LabelScanner.svelte";
  import BarcodeScanner from "../BarcodeScanner.svelte";
  import { labelOcrAvailable, type LabelScanResult } from "../labelOcr";
  import { barcodeScanIsNative, scanBarcodeNative } from "../barcodeScan";
  import { segment, segmentTrack } from "./style";

  // Create or edit a food of your own. Full screen. Scanning the label fills the form;
  // a barcode that wasn't found comes in pre-set so the next scan finds this food.
  interface Props {
    existing?: CustomFood | null;
    name?: string;
    barcode?: string;
    /** Came from a barcode that wasn't found: say so and offer the label scan up front. */
    fromMissingBarcode?: boolean;
    startWithLabelScan?: boolean;
    onsave: (food: CustomFood) => void;
    onclose: () => void;
    ondelete?: (() => void) | null;
  }
  const {
    existing = null,
    name: startName = "",
    barcode: startBarcode = "",
    fromMissingBarcode = false,
    startWithLabelScan = false,
    onsave,
    onclose,
    ondelete = null,
  }: Props = $props();

  const ocrReady = labelOcrAvailable();
  let showLabel = $state(false);
  let showBarcode = $state(false);

  function r1(n: number): string {
    return String(Math.round(n * 10) / 10);
  }

  // Opened fresh per food: starting values are read once.
  const f = untrack(() => existing?.food);
  const init = untrack(() => ({ name: startName, barcode: startBarcode }));
  const form = $state({
    name: f?.name ?? init.name,
    brand: f?.brand ?? "",
    barcode: f?.barcode ?? init.barcode,
    basis: "100g" as "100g" | "serving",
    servingG: "",
    kcal: f ? r1(f.per100g.kcal) : "",
    protein: f ? r1(f.per100g.proteinG) : "",
    carbs: f ? r1(f.per100g.carbsG) : "",
    fat: f ? r1(f.per100g.fatG) : "",
  });
  let servings = $state<{ id: string; label: string; grams: string }[]>(
    (f?.servings ?? [])
      .filter((s) => s.id !== "g" && s.grams > 0)
      .map((s) => ({ id: s.id, label: s.label.replace(/\s*\(\d+(\.\d+)?\s*g\)\s*$/, ""), grams: r1(s.grams) })),
  );
  let warnings = $state<string[]>([]);
  let tried = $state(false);

  onMount(() => {
    openOverlay();
    if (startWithLabelScan && ocrReady) showLabel = true;
    return () => closeOverlay();
  });

  const num = (s: string) => Number(String(s).replace(",", "."));
  const kcalN = $derived(num(form.kcal));
  const macroKcal = $derived(kcalFromMacros(num(form.protein) || 0, num(form.carbs) || 0, num(form.fat) || 0));
  const hasMacros = $derived(form.protein !== "" || form.carbs !== "" || form.fat !== "");
  const macrosAgree = $derived(
    !hasMacros || !(kcalN > 0) || Math.abs(macroKcal - kcalN) <= Math.max(15, kcalN * 0.12),
  );
  const servingN = $derived(num(form.servingG));
  const nameMissing = $derived(tried && !form.name.trim());
  const kcalMissing = $derived(tried && !(kcalN > 0));
  const servingMissing = $derived(tried && form.basis === "serving" && !(servingN > 0));

  function onLabel(r: LabelScanResult) {
    showLabel = false;
    const m = r.per100g ?? r.perServing;
    form.basis = r.per100g ? "100g" : "serving";
    if (r.servingSizeG) {
      form.servingG = String(Math.round(r.servingSizeG));
      if (!servings.some((s) => num(s.grams) === Math.round(r.servingSizeG!))) {
        servings = [...servings, { id: `s${Date.now()}`, label: "serving", grams: String(Math.round(r.servingSizeG)) }];
      }
    }
    if (m) {
      form.kcal = m.kcal ? String(Math.round(m.kcal)) : "";
      form.protein = r1(m.proteinG);
      form.carbs = r1(m.carbsG);
      form.fat = r1(m.fatG);
    }
    warnings = r.warnings;
  }

  async function scanBarcode() {
    if (!barcodeScanIsNative()) {
      showBarcode = true;
      return;
    }
    try {
      const code = await scanBarcodeNative();
      if (code) form.barcode = code;
    } catch {
      toast("Couldn't open the barcode scanner.");
    }
  }

  async function save() {
    tried = true;
    if (!form.name.trim() || !(kcalN > 0)) return;
    if (form.basis === "serving" && !(servingN > 0)) return;
    let per100g = {
      kcal: kcalN,
      proteinG: num(form.protein) || 0,
      carbsG: num(form.carbs) || 0,
      fatG: num(form.fat) || 0,
    };
    if (form.basis === "serving") {
      const k = 100 / servingN;
      per100g = {
        kcal: Math.round(per100g.kcal * k * 10) / 10,
        proteinG: Math.round(per100g.proteinG * k * 10) / 10,
        carbsG: Math.round(per100g.carbsG * k * 10) / 10,
        fatG: Math.round(per100g.fatG * k * 10) / 10,
      };
    }
    const named: ServingOption[] = servings
      .filter((s) => s.label.trim() && num(s.grams) > 0)
      .map((s, i) => ({
        id: s.id || `s${i}`,
        label: `${s.label.trim()} (${r1(num(s.grams))} g)`,
        grams: num(s.grams),
      }));
    if (form.basis === "serving" && !named.some((s) => s.grams === servingN)) {
      named.unshift({ id: "serving", label: `serving (${r1(servingN)} g)`, grams: servingN });
    }
    const all = [gramServing(), ...named];
    const repo = getNutritionRepo();
    let saved: CustomFood;
    if (existing) {
      saved = updateCustomFood(existing, {
        name: form.name,
        brand: form.brand.trim() || null,
        per100g,
        servings: all,
      });
      saved = { ...saved, food: { ...saved.food, barcode: form.barcode.trim() || undefined } };
    } else {
      saved = createCustomFood({
        name: form.name,
        brand: form.brand.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        per100g,
        servings: all,
      });
    }
    await repo.saveCustomFood(saved);
    pushCustomFood(saved);
    onsave(saved);
  }

  const inputCls =
    "h-12 w-full rounded-xl bg-muted px-3 text-[15px] outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70";
</script>

{#if showLabel}
  <LabelScanner onResult={onLabel} onClose={() => (showLabel = false)} />
{/if}
{#if showBarcode}
  <BarcodeScanner
    onResult={(c: string) => {
      showBarcode = false;
      form.barcode = c;
    }}
    onClose={() => (showBarcode = false)}
  />
{/if}

<div
  class="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]"
  role="dialog"
  aria-modal="true"
  aria-label={existing ? "Edit food" : "New food"}
  transition:fly={{ y: 24, duration: 180 }}
>
  <div class="flex h-14 shrink-0 items-center gap-1 px-1">
    <button type="button" class="flex size-11 items-center justify-center rounded-lg" aria-label="Close" onclick={onclose}>
      <X class="size-5" />
    </button>
    <h1 class="flex-1 text-lg font-bold">{existing ? "Edit food" : "New food"}</h1>
    <button
      type="button"
      class="mr-2 h-10 rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
      onclick={() => void save()}
    >
      Save
    </button>
  </div>

  <div class="flex-1 overflow-y-auto px-4 pb-10">
    <div class="mx-auto flex max-w-lg flex-col gap-4 pt-1">
      {#if fromMissingBarcode}
        <div class="rounded-xl bg-card px-3.5 py-3 text-sm">
          <p class="font-semibold">Barcode not found</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Add it once and the next scan of <span class="tabular-nums">{form.barcode}</span> will find it.
          </p>
        </div>
      {/if}

      {#if ocrReady}
        <button
          type="button"
          class="flex items-center gap-3 rounded-xl border border-dashed border-foreground/20 px-3.5 py-3 text-left"
          onclick={() => (showLabel = true)}
        >
          <ScanText class="size-6 shrink-0" />
          <span class="flex-1">
            <span class="block font-semibold">Scan the nutrition label</span>
            <span class="block text-xs text-muted-foreground">Fills in the numbers below from a photo</span>
          </span>
        </button>
      {/if}

      {#each warnings as w (w)}
        <p class="flex gap-2 text-xs text-warning"><AlertTriangle class="size-4 shrink-0" />{w}</p>
      {/each}

      <div class="grid grid-cols-[1.4fr_1fr] gap-2">
        <label class="flex min-w-0 flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Name</span>
          <input class="{inputCls} {nameMissing ? 'ring-2 ring-destructive' : ''}" bind:value={form.name} placeholder="e.g. Skyr, natural" />
        </label>
        <label class="flex min-w-0 flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Brand <span class="font-normal">(optional)</span></span>
          <input class={inputCls} bind:value={form.brand} />
        </label>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">Nutrition</span>
        <div class={segmentTrack} role="radiogroup" aria-label="Values are">
          <button type="button" role="radio" aria-checked={form.basis === "100g"} class={segment(form.basis === "100g")} onclick={() => (form.basis = "100g")}>Per 100 g</button>
          <button type="button" role="radio" aria-checked={form.basis === "serving"} class={segment(form.basis === "serving")} onclick={() => (form.basis = "serving")}>Per serving</button>
        </div>
        {#if form.basis === "serving"}
          <label class="flex items-center gap-2 text-sm">
            <span class="text-muted-foreground">1 serving =</span>
            <input class="{inputCls} h-10 w-20 text-center tabular-nums {servingMissing ? 'ring-2 ring-destructive' : ''}" inputmode="decimal" bind:value={form.servingG} />
            <span class="text-muted-foreground">g</span>
          </label>
        {/if}
        <div class="grid grid-cols-4 gap-2">
          {#each [["kcal", "kcal", ""], ["protein", "Protein", "text-macro-protein"], ["carbs", "Carbs", "text-macro-carbs"], ["fat", "Fat", "text-macro-fat"]] as [key, label, color] (key)}
            <label class="flex min-w-0 flex-col gap-1">
              <span class="text-center text-xs font-medium {color || 'text-muted-foreground'}">{label}</span>
              <input
                class="{inputCls} text-center font-semibold tabular-nums {key === 'kcal' && (kcalMissing || !macrosAgree) ? 'ring-2 ' + (kcalMissing ? 'ring-destructive' : 'ring-warning') : ''}"
                inputmode="decimal"
                bind:value={form[key as "kcal" | "protein" | "carbs" | "fat"]}
              />
            </label>
          {/each}
        </div>
        {#if hasMacros && kcalN > 0}
          {#if macrosAgree}
            <p class="flex items-center gap-1.5 text-xs text-success"><Check class="size-3.5" />Macros add up to {Math.round(macroKcal)} kcal</p>
          {:else}
            <p class="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle class="mt-px size-3.5 shrink-0" />
              Protein, carbs and fat add up to {Math.round(macroKcal)} kcal, not {Math.round(kcalN)}. Worth a second look.
            </p>
          {/if}
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground">Serving sizes</span>
        <div class="overflow-hidden rounded-xl bg-card">
          {#each servings as s, i (s.id)}
            <div class="flex items-center gap-2 border-b border-border py-1.5 pl-3 pr-1">
              <input class="h-10 min-w-0 flex-1 bg-transparent outline-none" bind:value={s.label} placeholder="e.g. 1 pot" aria-label="Serving name" />
              <input class="h-10 w-16 rounded-lg bg-muted px-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-ring" inputmode="decimal" bind:value={s.grams} aria-label="Grams" />
              <span class="text-sm text-muted-foreground">g</span>
              <button type="button" class="flex size-10 items-center justify-center text-muted-foreground" aria-label="Remove {s.label || 'serving'}" onclick={() => (servings = servings.filter((_, j) => j !== i))}>
                <X class="size-4" />
              </button>
            </div>
          {/each}
          <button
            type="button"
            class="flex h-12 w-full items-center gap-2 px-3 text-sm font-medium"
            onclick={() => (servings = [...servings, { id: `s${Date.now()}`, label: "", grams: "" }])}
          >
            <Plus class="size-4" /> Add a serving size
          </button>
        </div>
        <p class="text-xs text-muted-foreground">Grams, ml and oz always work too.</p>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">Barcode <span class="font-normal">(optional)</span></span>
        <span class="flex gap-2">
          <input class="{inputCls} tabular-nums" inputmode="numeric" bind:value={form.barcode} placeholder="So a scan finds it next time" />
          <button type="button" class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted" aria-label="Scan barcode" onclick={() => void scanBarcode()}>
            <ScanBarcode class="size-5" />
          </button>
        </span>
      </label>

      {#if existing}
        <p class="text-xs text-muted-foreground">Entries you already logged keep the numbers they had.</p>
      {/if}
      {#if ondelete}
        <button type="button" class="h-11 self-start text-sm font-medium text-destructive" onclick={ondelete}>Delete this food</button>
      {/if}
    </div>
  </div>
</div>
