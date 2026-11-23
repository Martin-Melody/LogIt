<!-- Settings › Units & equipment: kg/lb, cm/in, and the barbell the plate breakdown uses. -->
<script lang="ts">
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { equipment } from "$lib/stores/equipment.store";
  import { DEFAULT_BARBELL } from "@logit/core/domain/plates";
  import { toDisplayWeight, fromDisplayWeight } from "@logit/core/domain/units";

  const trimNum = (n: number) => Number(n.toFixed(2)).toString();
  const barWeightDisplay = $derived(trimNum(toDisplayWeight($equipment.barbell.barKg, $profile.weightUnit)));
  const platesDisplay = $derived(
    $equipment.barbell.platesKg.map((p) => trimNum(toDisplayWeight(p, $profile.weightUnit))).join(", "),
  );
  function saveBarWeight(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    equipment.save({ barbell: { ...$equipment.barbell, barKg: fromDisplayWeight(n, $profile.weightUnit) } });
  }
  function savePlates(v: string) {
    const list = v
      .split(/[\s,]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => fromDisplayWeight(n, $profile.weightUnit));
    if (list.length === 0) return;
    equipment.save({ barbell: { ...$equipment.barbell, platesKg: list } });
  }
  function applyBarPreset(kind: "kg" | "lb") {
    equipment.save({
      barbell:
        kind === "kg"
          ? { barKg: 20, platesKg: [...DEFAULT_BARBELL.platesKg] }
          : {
              barKg: fromDisplayWeight(45, "lbs"),
              platesKg: [45, 35, 25, 10, 5, 2.5].map((p) => fromDisplayWeight(p, "lbs")),
            },
    });
  }
  const unit = $derived($profile.weightUnit === "lbs" ? "lb" : "kg");
</script>

<SettingsPage title="Units & equipment">
  <SettingsSection id="units" title="Units" note="Weights are always stored in kilograms. This only changes what you see and type.">
    <div class={settingRow}>
      <span class="flex-1 text-[15px] font-medium">Weight</span>
      <div class={segmentTrack}>
        {#each [["kg", "kg"], ["lbs", "lb"]] as ["kg" | "lbs", string][] as [value, label] (value)}
          <button type="button" class={segment($profile.weightUnit === value)} aria-pressed={$profile.weightUnit === value}
            onclick={() => profile.save({ weightUnit: value })}>{label}</button>
        {/each}
      </div>
    </div>
    <div class={settingRow}>
      <span class="flex-1 text-[15px] font-medium">Height</span>
      <div class={segmentTrack}>
        {#each [["cm", "cm"], ["in", "in"]] as ["cm" | "in", string][] as [value, label] (value)}
          <button type="button" class={segment($profile.heightUnit === value)} aria-pressed={$profile.heightUnit === value}
            onclick={() => profile.save({ heightUnit: value })}>{label}</button>
        {/each}
      </div>
    </div>
  </SettingsSection>

  <SettingsSection title="Barbell" note="Used for the plate breakdown and warm-up ramps.">
    <div id="bar-weight" class={settingRow}>
      <label class="flex-1 text-[15px] font-medium" for="bar-weight-input">Bar weight</label>
      <input id="bar-weight-input" type="number" min="1"
        class="h-10 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
        value={barWeightDisplay}
        onchange={(e) => saveBarWeight((e.currentTarget as HTMLInputElement).value)} />
      <span class="text-sm text-muted-foreground">{unit}</span>
    </div>
    <div id="bar-plates" class="flex scroll-mt-4 flex-col gap-2.5 px-3 py-3">
      <label class="text-[15px] font-medium" for="bar-plates-input">Plates ({unit}, comma-separated)</label>
      <input id="bar-plates-input" type="text" inputmode="decimal"
        class="h-10 w-full rounded-md border bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
        value={platesDisplay}
        onchange={(e) => savePlates((e.currentTarget as HTMLInputElement).value)} />
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onclick={() => applyBarPreset("kg")}>Standard kg set</Button>
        <Button size="sm" variant="outline" onclick={() => applyBarPreset("lb")}>Standard lb set</Button>
      </div>
    </div>
  </SettingsSection>
</SettingsPage>
