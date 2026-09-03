# Bug: can't add a food manually after a barcode miss

**Reported:** 2026-09-03 (Martin, on-device — Galaxy S23, release build `29acef8`)
**Area:** Nutrition → log → barcode scan → "not found" → label / manual entry
**Severity:** High — dead end in a core flow. Not a crash; the user can back out, but
there is no working way to add and portion a food that isn't in the DB.

---

## What happens

1. In the diary logger (`/nutrition/log`), scan a barcode that isn't in the bundled
   DB or Open Food Facts. The app shows **"No match for barcode …"** with one action:
   **"Scan the nutrition label"**.
2. The user's product has **no nutrition panel** (fresh/bulk item, homemade, etc.), so
   there's nothing to OCR. To get past the screen they photograph *something* (a hand).
3. OCR correctly reports no text (`"No text found in the photo."`) and drops the user
   into the **"From the label — check and save"** form with all fields blank.
4. The user types the name, kcal and P/C/F by hand and taps **"Save & choose portion"**.
5. **Nothing happens.** No error, no toast, the form stays open. The food is never
   saved and the user can't proceed to set a portion size for the meal.

### Workaround the user found (and why it's bad)

Back out to **Quick add**. That logs a one-off diary row with the entered macros, but:
- it does **not** create a reusable custom food (can't be favourited, won't be found by
  the next scan of that barcode),
- it has **no gram/serving scaling** — you enter the *final* macros for the portion, so
  you have to read the label and do the maths yourself.

---

## Root cause

`apps/clients/logit-frontend/src/routes/nutrition/log/+page.svelte`

### 1. The save silently no-ops when basis is "serving" with no serving size

When OCR returns nothing, `parseNutritionLabel("")` returns
`{ per100g: undefined, perServing: undefined, servingSizeG: undefined, confidence: 0,
warnings: ["No text found in the photo."] }`
(`packages/core/src/nutrition/labelParser.ts:270-277`).

`onLabelScanned()` then sets the draft basis from whether per-100 g values were read:

```js
// log/+page.svelte  (~line 264)
labelDraft.basis = r.per100g ? "100g" : "serving";   // → "serving" on an empty scan
labelDraft.servingG = r.servingSizeG ? String(...) : "";   // → ""
```

So after a failed scan the form defaults to **"serving"** basis with an **empty serving
size**. `saveLabelFood()` then hits:

```js
// log/+page.svelte  (~line 292)
if (labelDraft.basis === "serving" && !hasServing) return;  // silent
```

The user has to notice the small `Values per [ 100 g ] [ serving ]` toggle and switch it
to **100 g** (or fill in "g in a serving"). There is **no feedback** that the save was
blocked or why — `saveLabelFood()` just `return`s. Same silent-return on an empty name or
non-positive kcal (`~line 282`).

### 2. There is no non-OCR path to "add a custom food" from the not-found state

The "no match for barcode" panel (`log/+page.svelte:497-518`) offers only **"Scan the
nutrition label"**. When OCR isn't available it degrades to a text hint
("Add it with Quick add, or create a custom food") with **no button**. A full
"New custom food" form already exists at `/nutrition/foods`
(`routes/nutrition/foods/+page.svelte:285`, `createCustomFood` + `saveCustomFood`) but
nothing links to it from the logging flow, and it wouldn't carry the scanned barcode or
return you to portion selection.

So a food with no label at all can only be entered by: fail a barcode scan → be forced to
"scan a label" → photograph anything → get a failed OCR → land in a form that silently
refuses to save unless you also flip a basis toggle you had no reason to touch.

---

## Expected behaviour

- After a barcode miss, offer **two** actions: "Scan the nutrition label" **and**
  "Enter details manually" — the latter opens the same draft form pre-set to
  `basis: "100g"` (the common case) with the barcode attached.
- `saveLabelFood()` should **surface why it can't save** instead of returning silently:
  disable the button with a hint, or show an inline error ("Enter a serving size, or
  switch to 'per 100 g'").
- After a **failed** OCR, default the draft to `basis: "100g"` (not "serving") since
  there's no serving size to work with, and lead with a line like "Nothing read — enter
  the values from the package."
- Saving a manual food should create a real custom food (reusable, favouritable,
  barcode-tagged) and continue to portion selection — same as a successful label scan.

---

## Suggested fixes (smallest first)

1. **In `onLabelScanned()`**, when `!r.per100g && !r.perServing`, force
   `labelDraft.basis = "100g"`. One line; unblocks the exact reported path.
2. **In `saveLabelFood()`**, replace the three silent `return`s with visible validation
   (disable the Save button + inline message). Prevents the "I tapped it and nothing
   happened" dead end generally.
3. **Add an "Enter manually" button** to the not-found panel (`log/+page.svelte:497`)
   that opens `labelDraft` directly (no scanner), `basis: "100g"`,
   `notFoundBarcode` retained so the food is barcode-tagged.
4. **Quick add**: either persist it as a custom food too, or add a "grams" field so it
   scales like a real food. At minimum, note in the UI that quick-add rows aren't reusable.

Items 1–3 are contained to `log/+page.svelte`; item 4 touches `addQuick()` and the
quick-add form.

---

## Also worth checking (user's second hypothesis)

The user suspects the save may fail *even when OCR does read the label* but wasn't sure.
Worth a test: scan a real label that parses to **per-serving only** (no per-100 g column)
without a detected serving size → `basis` would be `"serving"`, `servingG` empty → same
silent `return` at line 292. Likely the same bug, second trigger.
