<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import { profile } from "$lib/stores/profile.store";
  import { saveBodyweight } from "./bodyweight";
  import type { WeightUnit } from "$lib/features/nutrition/nutrition";

  /**
   * Asked when a bodyweight exercise (pull-ups, dips…) is added and no bodyweight
   * is known: its volume is bodyweight ± the logged number, so without one those
   * sets only count their added weight.
   */
  const {
    exerciseName = null,
    onClose = () => {},
  }: {
    /** The exercise just added; the dialog is open while this is set. */
    exerciseName?: string | null;
    onClose?: (saved: boolean) => void;
  } = $props();

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  let value = $state("");
  let saving = $state(false);
  const parsed = $derived(Number(value.replace(",", ".")));
  const valid = $derived(value.trim() !== "" && Number.isFinite(parsed) && parsed >= 25 && parsed <= 700);

  $effect(() => {
    if (exerciseName) value = "";
  });

  async function save() {
    if (!valid || saving) return;
    saving = true;
    try {
      await saveBodyweight(parsed, unit);
      onClose(true);
    } catch {
      toast.error("Couldn't save your weight");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root open={exerciseName !== null} onOpenChange={(v) => { if (!v) onClose(false); }}>
  <Dialog.Content class="sm:max-w-[400px]">
    <Dialog.Header>
      <Dialog.Title>What do you weigh?</Dialog.Title>
      <Dialog.Description>
        {exerciseName} moves your bodyweight, so its volume is your weight plus any added weight, or minus any assistance.
        It also goes in your weight log.
      </Dialog.Description>
    </Dialog.Header>

    <form class="flex flex-col gap-1.5" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <label class="text-sm font-medium" for="bw-prompt-weight">Bodyweight</label>
      <div class="relative">
        <input
          id="bw-prompt-weight"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          class="h-12 w-full rounded-lg border bg-background pl-3 pr-12 text-lg font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value
        />
        <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit}</span>
      </div>
    </form>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => onClose(false)} disabled={saving}>Not now</Button>
      <Button onclick={save} disabled={!valid || saving}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
