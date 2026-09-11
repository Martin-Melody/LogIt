<script lang="ts">
  import { X, Check } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { sheetUp, reveal } from "$lib/transitions";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import type { MobilityMetric, MobilitySide } from "@logit/core/domain/workout";
  import type { MobilityDrill } from "@logit/core/domain/mobilityDrill";
  import { getMobilityDrillCatalog } from "$lib/data/mobilityDrillCatalog";
  import {
    mobilityDrillKey,
    getMobilityDrillLeadSide,
    setMobilityDrillLeadSide,
  } from "$lib/data/mobilityDrillPrefs";
  import { profile } from "$lib/stores/profile.store";

  export type MobilityDetailTarget = {
    drillName: string;
    drillId?: string;
    metric: MobilityMetric;
    perSide: boolean;
  };

  const {
    target = null,
    onClose = () => {},
    onRename = async (_name: string) => {},
    onLeadSideChange = async (_side: MobilitySide | undefined) => {},
  } = $props<{
    /** null closes the sheet. */
    target?: MobilityDetailTarget | null;
    onClose?: () => void;
    onRename?: (name: string) => void | Promise<void>;
    onLeadSideChange?: (side: MobilitySide | undefined) => void | Promise<void>;
  }>();

  let nameDraft = $state("");
  let catalogEntry = $state<MobilityDrill | null>(null);
  let drillLead = $state<MobilitySide | undefined>(undefined);
  let saving = $state(false);
  let lastKey = "";

  $effect(() => {
    if (!target) return;
    openOverlay();
    const key = `${target.drillId ?? ""}|${target.drillName}`;
    if (key !== lastKey) {
      lastKey = key;
      nameDraft = target.drillName;
      void getMobilityDrillCatalog().then((catalog) => {
        catalogEntry =
          catalog.find(
            (d) => d.id === target.drillId || d.name.toLowerCase() === target.drillName.toLowerCase(),
          ) ?? null;
      });
      void getMobilityDrillLeadSide(mobilityDrillKey(target.drillId, target.drillName)).then(
        (v) => (drillLead = v),
      );
    }
    return () => closeOverlay();
  });

  async function commitRename() {
    const next = nameDraft.trim();
    if (!target || !next || next === target.drillName) return;
    saving = true;
    try {
      await onRename(next);
    } finally {
      saving = false;
    }
  }

  async function pickLead(side: MobilitySide | undefined) {
    if (!target) return;
    drillLead = side;
    saving = true;
    try {
      await setMobilityDrillLeadSide(mobilityDrillKey(target.drillId, target.drillName), side);
      await onLeadSideChange(side);
    } finally {
      saving = false;
    }
  }
</script>

{#if target}
  <button
    type="button"
    class="fixed inset-0 bg-black/40 z-40"
    onclick={onClose}
    aria-label="Close"
    transition:fade={{ duration: 150 }}
  ></button>

  <div
    class="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-[500px] flex-col rounded-t-xl border-t border-border bg-background max-h-[88dvh]"
    transition:sheetUp
  >
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <p class="text-sm font-semibold truncate">{target.drillName}</p>
      <button type="button" class="p-1 text-muted-foreground hover:text-foreground" onclick={onClose} aria-label="Close details">
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col gap-5">
      <!-- Name -->
      <div class="flex flex-col gap-2">
        <Label for="mds-name">Name</Label>
        <div class="flex gap-2">
          <input
            id="mds-name"
            class="flex-1 min-w-0 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={nameDraft}
            disabled={saving}
            onkeydown={(e) => { if (e.key === "Enter") void commitRename(); }}
          />
          {#if nameDraft.trim() && nameDraft.trim() !== target.drillName}
            <Button size="sm" disabled={saving} onclick={() => void commitRename()}>Save</Button>
          {/if}
        </div>
      </div>

      <!-- Catalog info -->
      {#if catalogEntry}
        <div class="flex flex-col gap-1.5 text-sm" transition:reveal>
          <p class="text-xs uppercase tracking-wide text-muted-foreground">{catalogEntry.area.replace("-", " ")}</p>
          {#if catalogEntry.cues.length}
            <ul class="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
              {#each catalogEntry.cues as cue (cue)}
                <li>{cue}</li>
              {/each}
            </ul>
          {/if}
          {#if catalogEntry.notes}
            <p class="text-xs text-muted-foreground">{catalogEntry.notes}</p>
          {/if}
        </div>
      {/if}

      <!-- Lead side, for unilateral drills -->
      {#if target.perSide}
        <div class="flex flex-col gap-2">
          <Label>Which side leads — this drill</Label>
          <p class="text-xs text-muted-foreground -mt-1">
            Overrides your app-wide default whenever you add {target.drillName}. Still overridable per set.
          </p>
          <div class="flex gap-1.5">
            {#each [{ v: undefined, t: `App default (${$profile.mobilityLeadSide === "right" ? "R" : "L"})` }, { v: "left", t: "Left" }, { v: "right", t: "Right" }] as opt (opt.t)}
              <button
                type="button"
                class="flex-1 py-1.5 text-xs rounded border transition-colors flex items-center justify-center gap-1 {drillLead === opt.v
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'}"
                disabled={saving}
                onclick={() => void pickLead(opt.v as MobilitySide | undefined)}
              >
                {#if drillLead === opt.v}<Check class="h-3 w-3" />{/if}
                {opt.t}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
