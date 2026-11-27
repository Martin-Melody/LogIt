<!-- Canvas MP3: one of your recipes. Photo, servings and time, ingredients for the whole recipe,
     the method (the shared text editor), what it's good for, and one serving worked out. The
     same recipe as in your own diary; meal plans take a copy when you add it, so changing it here
     doesn't change plans you've given. Saves as you go. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import RichTextEditor from "$lib/components/rich-text-editor.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { getOwnNutritionDeps, getWebFoodDbRepo } from "$lib/deps";
  import { uploadPhoto } from "@logit/core/api/photosApi";
  import { createId } from "@logit/core/domain/ids";
  import { scaleNutrients } from "@logit/core/domain/nutrients";
  import { DIET_TAGS, DIET_TAG_LABELS, recomputeRecipe, roundMacros, scaleMacros, type DietTag, type Recipe } from "@logit/core/domain/nutrition";

  const id = $derived(page.params.id!);
  const repo = getOwnNutritionDeps().nutritionRepo;
  let recipe = $state<Recipe | null>(null);
  let loaded = $state(false);
  let status = $state<"saved" | "saving" | "error">("saved");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let method = $state("");

  onMount(async () => {
    recipe = await repo.getRecipe(id).catch(() => null);
    method = recipe?.notes ?? "";
    loaded = true;
  });

  function edit(fn: (r: Recipe) => Recipe) {
    if (!recipe) return;
    recipe = recomputeRecipe({ ...fn(recipe), updatedAtMs: Date.now() });
    status = "saving";
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }
  async function save() {
    if (!recipe) return;
    try {
      await repo.saveRecipe($state.snapshot(recipe) as Recipe);
      status = "saved";
    } catch {
      status = "error";
      timer = setTimeout(save, 5000);
    }
  }
  // The method saves when it stops changing.
  $effect(() => {
    const m = method;
    if (recipe && m !== (recipe.notes ?? "")) edit((r) => ({ ...r, notes: m || undefined }));
  });

  // Ingredients: search, then grams.
  let adding = $state(false);
  let found = $state<Awaited<ReturnType<ReturnType<typeof getWebFoodDbRepo>["searchFoods"]>>>([]);
  let pending = $state<(typeof found)[number] | null>(null);
  let grams = $state("100");
  let query = $state("");
  let searching = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function onQuery() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = query.trim();
      if (!q) return void (found = []);
      searching = true;
      const res = await getWebFoodDbRepo().searchFoods(q, { limit: 10 }).catch(() => []);
      if (q === query.trim()) found = res;
      searching = false;
    }, 300);
  }
  function pick(f: (typeof found)[number]) {
    pending = f;
    grams = "100";
    query = "";
    found = [];
  }
  function addIngredient() {
    const f = pending;
    const g = Number(grams.replace(",", "."));
    if (!f || !(g > 0)) return;
    edit((r) => ({ ...r, ingredients: [...r.ingredients, { id: createId("ing"), sourceId: f.id, name: f.name, ...(f.brand ? { brand: f.brand } : {}), grams: g, computed: roundMacros(scaleMacros(f.per100g, g)), ...(f.nutrients ? { nutrients: scaleNutrients(f.nutrients, g) } : {}) }] }));
    pending = null;
    adding = false;
  }
  function setGrams(ingId: string, text: string) {
    const g = Number(text.replace(",", "."));
    if (!(g > 0)) return;
    edit((r) => ({ ...r, ingredients: r.ingredients.map((i) => {
      if (i.id !== ingId) return i;
      const k = g / i.grams;
      return { ...i, grams: g, computed: roundMacros({ kcal: i.computed.kcal * k, proteinG: i.computed.proteinG * k, carbsG: i.computed.carbsG * k, fatG: i.computed.fatG * k }), ...(i.nutrients ? { nutrients: Object.fromEntries(Object.entries(i.nutrients).map(([key, v]) => [key, (v ?? 0) * k])) } : {}) };
    }) }));
  }
  function toggleTag(t: DietTag) {
    edit((r) => ({ ...r, tags: (r.tags ?? []).includes(t) ? (r.tags ?? []).filter((x) => x !== t) : [...(r.tags ?? []), t] }));
  }
  let uploading = $state(false);
  let fileEl = $state<HTMLInputElement | null>(null);
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    uploading = true;
    try {
      const p = await uploadPhoto(file);
      edit((r) => ({ ...r, photoUrl: p.url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the photo");
    } finally {
      uploading = false;
    }
  }
  const fieldCls = "h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px]";
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Nutrition", href: "/coaching/nutrition" }, { label: "Recipes", href: "/coaching/nutrition?tab=recipes" }, { label: recipe?.name ?? "Recipe" }]} />
  {#if !loaded}
    <Skeleton class="h-80" />
  {:else if !recipe}
    <p class="rounded-[10px] bg-muted px-4 py-3 text-[13px]">That recipe isn't one of yours, or it's been deleted.</p>
  {:else}
    <div class="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-[2_1_260px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
            <input value={recipe.name} onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) edit((r) => ({ ...r, name: v })); }} class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[15px] font-semibold text-foreground" />
          </label>
          <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Makes
            <span class="flex items-center gap-1.5"><input class="{fieldCls} w-16" inputmode="numeric" value={recipe.servings} onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); if (n >= 1 && n <= 50) edit((r) => ({ ...r, servings: n })); }} /><span class="text-[13px] text-foreground">servings</span></span>
          </label>
          <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Takes
            <span class="flex items-center gap-1.5"><input class="{fieldCls} w-16" inputmode="numeric" value={recipe.minutes ?? ""} onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); edit((r) => ({ ...r, minutes: n > 0 ? n : undefined })); }} /><span class="text-[13px] text-foreground">min</span></span>
          </label>
          <span class="pb-2 text-xs text-muted-foreground" aria-live="polite">{status === "saving" ? "Saving…" : status === "error" ? "Couldn't save" : "Saved"}</span>
        </div>

        <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Ingredients">
          <h2 class="px-5 pb-2 pt-4 text-sm font-semibold">Ingredients <span class="font-normal text-muted-foreground">(whole recipe)</span></h2>
          {#each recipe.ingredients as ing (ing.id)}
            <div class="grid grid-cols-[1fr_6rem_4rem_2rem] items-center gap-2 border-t border-border px-5 py-1.5 text-[13px]">
              <span class="truncate">{ing.name}{#if ing.brand}<span class="text-muted-foreground"> · {ing.brand}</span>{/if}</span>
              <span class="flex items-center gap-1"><input class="h-8 w-16 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="{ing.name} grams" value={ing.grams} onchange={(e) => setGrams(ing.id, e.currentTarget.value)} /><span class="text-xs text-muted-foreground">g</span></span>
              <span class="text-right tabular-nums text-muted-foreground">{Math.round(ing.computed.kcal)}</span>
              <Button variant="ghost" size="icon" class="size-8" aria-label="Remove {ing.name}" onclick={() => edit((r) => ({ ...r, ingredients: r.ingredients.filter((x) => x.id !== ing.id) }))}>×</Button>
            </div>
          {/each}
          <div class="border-t border-border px-5 py-3">
            {#if pending}
              <div class="flex flex-wrap items-center gap-2 text-[13px]">
                <span class="font-medium">{pending.name}</span>
                <input class="h-8 w-20 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="Grams" bind:value={grams} />
                <span class="text-xs text-muted-foreground">g</span>
                <Button size="sm" onclick={addIngredient}>Add</Button>
                <Button variant="ghost" size="sm" onclick={() => (pending = null)}>Cancel</Button>
              </div>
            {:else if adding}
              <div class="flex flex-col gap-1.5">
                <span class="flex gap-2">
                  <!-- svelte-ignore a11y_autofocus -->
                  <input autofocus bind:value={query} oninput={onQuery} onkeydown={(e) => { if (e.key === "Escape") adding = false; }} placeholder="Search foods" aria-label="Search foods for an ingredient" class="{fieldCls} flex-1" />
                  <Button variant="ghost" size="sm" onclick={() => (adding = false)}>Cancel</Button>
                </span>
                {#if searching}<span class="text-xs text-muted-foreground">Searching…</span>{/if}
                <ul class="flex flex-col" aria-label="Foods">
                  {#each found as f (f.id)}
                    <li><button type="button" class="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-muted" onclick={() => pick(f)}>
                      <span class="truncate">{f.name}{#if f.brand}<span class="text-muted-foreground"> · {f.brand}</span>{/if}</span>
                      <span class="shrink-0 text-xs text-muted-foreground">{Math.round(f.per100g.kcal)} kcal per 100 g</span>
                    </button></li>
                  {/each}
                </ul>
              </div>
            {:else}
              <Button variant="outline" size="sm" onclick={() => (adding = true)}>+ Ingredient</Button>
            {/if}
          </div>
        </section>

        <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Method">
          <h2 class="text-sm font-semibold">Method</h2>
          <RichTextEditor bind:value={method} label="Method" placeholder="1. Cook the rice." maxlength={4000} />
        </section>
      </div>

      <aside class="flex flex-col gap-4">
        <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Photo">
          {#if recipe.photoUrl}<img src={recipe.photoUrl} alt={recipe.name} class="aspect-[4/3] w-full rounded-[10px] object-cover" />{/if}
          <input bind:this={fileEl} type="file" accept="image/*" class="hidden" onchange={(e) => void onPhoto(e.currentTarget.files?.[0])} />
          <span class="flex gap-2">
            <Button variant="outline" size="sm" disabled={uploading} onclick={() => fileEl?.click()}>{uploading ? "Adding…" : recipe.photoUrl ? "Change photo" : "Add a photo"}</Button>
            {#if recipe.photoUrl}<Button variant="ghost" size="sm" onclick={() => edit((r) => ({ ...r, photoUrl: undefined }))}>Remove</Button>{/if}
          </span>
        </section>
        <section class="flex flex-col gap-1 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="One serving">
          <h2 class="text-sm font-semibold">One serving</h2>
          <p class="text-[22px] font-bold tabular-nums">{Math.round(recipe.perServing.kcal)} kcal</p>
          <p class="text-[13px] tabular-nums">Protein {Math.round(recipe.perServing.proteinG)} g · Carbs {Math.round(recipe.perServing.carbsG)} g · Fat {Math.round(recipe.perServing.fatG)} g</p>
          <p class="text-xs text-muted-foreground">Worked out from the ingredients ÷ {recipe.servings}. Clients log it as one item, or by weight if they made a different amount.</p>
        </section>
        <section class="flex flex-col gap-2 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="Good for">
          <h2 class="text-sm font-semibold">Good for</h2>
          <div class="flex flex-wrap gap-1.5">
            {#each DIET_TAGS as t (t)}
              {@const on = (recipe.tags ?? []).includes(t)}
              <Button size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onclick={() => toggleTag(t)}>{DIET_TAG_LABELS[t]}</Button>
            {/each}
          </div>
          <p class="text-xs text-muted-foreground">You tick these; LogIt doesn't guess from ingredients.</p>
        </section>
      </aside>
    </div>
  {/if}
</div>
