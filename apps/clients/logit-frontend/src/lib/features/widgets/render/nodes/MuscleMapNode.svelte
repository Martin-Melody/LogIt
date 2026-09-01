<script lang="ts">
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import type { WidgetMuscleMapNode } from "@logit/core/plugins/widgetView";
  import { FRONT_MUSCLES, BACK_MUSCLES, type MuscleDef } from "body-muscles";

  const { node }: { node: WidgetMuscleMapNode } = $props();

  const views: { label: string; muscles: MuscleDef[]; viewBox: string }[] = [
    { label: "Front", muscles: FRONT_MUSCLES, viewBox: "0 0 35 93" },
    { label: "Back", muscles: BACK_MUSCLES, viewBox: "37 0 35 93" },
  ];

  const MUSCLE_ID_MAP: Record<MuscleGroup, string[]> = {
    chest: ["chest-upper-left", "chest-lower-left", "chest-upper-right", "chest-lower-right", "serratus-anterior-left", "serratus-anterior-right"],
    back: ["lats-upper-left", "lats-mid-left", "lats-lower-left", "lats-upper-right", "lats-mid-right", "lats-lower-right", "traps-upper-left", "traps-mid-left", "traps-lower-left", "traps-upper-right", "traps-mid-right", "traps-lower-right", "lower-back-erectors-left", "lower-back-ql-left", "lower-back-erectors-right", "lower-back-ql-right", "spine"],
    shoulders: ["shoulder-front-left", "shoulder-side-left", "shoulder-front-right", "shoulder-side-right", "deltoid-rear-left", "deltoid-rear-right"],
    biceps: ["biceps-left", "biceps-right"],
    triceps: ["triceps-long-left", "triceps-lateral-left", "triceps-long-right", "triceps-lateral-right"],
    quads: ["quads-left", "quads-right"],
    hamstrings: ["hamstrings-medial-left", "hamstrings-lateral-left", "hamstrings-medial-right", "hamstrings-lateral-right"],
    glutes: ["gluteus-medius-left", "gluteus-maximus-left", "gluteus-medius-right", "gluteus-maximus-right"],
    calves: ["calves-gastroc-medial-left", "calves-gastroc-lateral-left", "calves-soleus-left", "calves-gastroc-medial-right", "calves-gastroc-lateral-right", "calves-soleus-right"],
    core: ["abs-upper-left", "abs-upper-right", "abs-lower-left", "abs-lower-right", "obliques-left", "obliques-right"],
    forearms: ["forearm-left", "forearm-right", "forearm-flexors-left", "forearm-extensors-left", "forearm-flexors-right", "forearm-extensors-right"],
  };

  const ID_TO_GROUP = new Map<string, MuscleGroup>();
  for (const [group, ids] of Object.entries(MUSCLE_ID_MAP) as [MuscleGroup, string[]][]) {
    for (const id of ids) ID_TO_GROUP.set(id, group);
  }

  const scale = $derived(node.scale ?? [1, 5, 12]);

  function fill(id: string): string {
    const group = ID_TO_GROUP.get(id);
    if (!group) return "var(--muscle-base)";
    const n = node.values[group] ?? 0;
    if (n <= 0) return "var(--muscle-base)";
    if (n < scale[0]) return "var(--muscle-base)";
    if (n < scale[1]) return "var(--muscle-low)";
    if (n < scale[2]) return "var(--muscle-med)";
    return "var(--muscle-high)";
  }

  function title(id: string): string {
    const group = ID_TO_GROUP.get(id);
    if (!group) return "";
    const n = Math.round(node.values[group] ?? 0);
    const label = group.charAt(0).toUpperCase() + group.slice(1);
    return `${label}: ${n} set${n === 1 ? "" : "s"}`;
  }
</script>

<div class="muscle-map flex flex-col gap-3">
  <div class="flex justify-center gap-4">
    {#each views as v (v.label)}
      <div class="flex flex-col items-center gap-1">
        <span class="text-[10px] text-muted-foreground uppercase tracking-widest">{v.label}</span>
        <svg viewBox={v.viewBox} width="110" height="auto" role="img" aria-label="{v.label} body muscle map">
          {#each v.muscles as m (m.id)}
            <path d={m.path} fill={fill(m.id)} aria-label={title(m.id) || m.name}>
              {#if ID_TO_GROUP.has(m.id)}<title>{title(m.id)}</title>{/if}
            </path>
          {/each}
        </svg>
      </div>
    {/each}
  </div>

  <div class="flex items-center justify-center gap-3">
    {#each [["var(--muscle-base)", "None"], ["var(--muscle-low)", "Light"], ["var(--muscle-med)", "Moderate"], ["var(--muscle-high)", "Heavy"]] as [color, label] (label)}
      <div class="flex items-center gap-1">
        <div class="w-2.5 h-2.5 rounded-[2px] shrink-0" style="background: {color}"></div>
        <span class="text-[10px] text-muted-foreground">{label}</span>
      </div>
    {/each}
  </div>

  {#if node.caption}
    <p class="text-center text-xs text-muted-foreground">{node.caption}</p>
  {/if}
</div>

<style>
  .muscle-map {
    --muscle-base: oklch(0.28 0.015 260);
    --muscle-low: oklch(0.38 0.14 145);
    --muscle-med: oklch(0.55 0.19 145);
    --muscle-high: oklch(0.72 0.22 145);
    --muscle-stroke: oklch(0.2 0.01 260);
  }
  :global(.light) .muscle-map {
    --muscle-base: oklch(0.8 0.015 260);
    --muscle-low: oklch(0.65 0.13 145);
    --muscle-med: oklch(0.5 0.18 145);
    --muscle-high: oklch(0.35 0.18 145);
    --muscle-stroke: oklch(0.4 0.02 260);
  }
  svg path {
    stroke: var(--muscle-stroke);
    stroke-width: 0.15;
    transition: fill 300ms ease;
  }
</style>
