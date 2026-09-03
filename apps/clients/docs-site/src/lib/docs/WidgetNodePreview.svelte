<script lang="ts">
  import { FRONT_MUSCLES, BACK_MUSCLES, type MuscleDef } from "body-muscles";

  /**
   * Compact, dependency-light renderers for the WidgetView primitives — kept
   * visually close to the real app renderers (lib/features/widgets/render/nodes)
   * for the docs gallery. If a primitive changes there, mirror it here.
   */
  let { node }: { node: any } = $props();

  // muscle-map
  const MUSCLE_ID_MAP: Record<string, string[]> = {
    chest: ["chest-upper-left", "chest-lower-left", "chest-upper-right", "chest-lower-right"],
    back: ["lats-upper-left", "lats-mid-left", "lats-upper-right", "lats-mid-right", "traps-upper-left", "traps-upper-right"],
    shoulders: ["shoulder-front-left", "shoulder-side-left", "shoulder-front-right", "shoulder-side-right", "deltoid-rear-left", "deltoid-rear-right"],
    biceps: ["biceps-left", "biceps-right"],
    triceps: ["triceps-long-left", "triceps-lateral-left", "triceps-long-right", "triceps-lateral-right"],
    quads: ["quads-left", "quads-right"],
    hamstrings: ["hamstrings-medial-left", "hamstrings-lateral-left", "hamstrings-medial-right", "hamstrings-lateral-right"],
    glutes: ["gluteus-medius-left", "gluteus-maximus-left", "gluteus-medius-right", "gluteus-maximus-right"],
    calves: ["calves-gastroc-medial-left", "calves-soleus-left", "calves-gastroc-medial-right", "calves-soleus-right"],
    core: ["abs-upper-left", "abs-upper-right", "abs-lower-left", "abs-lower-right", "obliques-left", "obliques-right"],
    forearms: ["forearm-left", "forearm-right"],
  };
  const idToGroup = new Map<string, string>();
  for (const [g, ids] of Object.entries(MUSCLE_ID_MAP)) for (const id of ids) idToGroup.set(id, g);
  function muscleFill(id: string): string {
    const g = idToGroup.get(id);
    const v = g ? (node.values?.[g] ?? 0) : 0;
    const [a, b, c] = node.scale ?? [1, 5, 12];
    if (v < a) return "var(--muscle-base)";
    if (v < b) return "var(--muscle-low)";
    if (v < c) return "var(--muscle-med)";
    return "var(--muscle-high)";
  }
  const views: { m: MuscleDef[]; vb: string }[] = [
    { m: FRONT_MUSCLES, vb: "0 0 35 93" },
    { m: BACK_MUSCLES, vb: "37 0 35 93" },
  ];

  // line
  const linePath = $derived.by(() => {
    const pts = node?.points ?? [];
    if (pts.length < 2) return "";
    const xs = pts.map((p: any) => p.x), ys = pts.map((p: any) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (x: number) => ((x - minX) / (maxX - minX || 1)) * 240;
    const sy = (y: number) => 56 - ((y - minY) / (maxY - minY || 1)) * 56;
    return pts.map((p: any, i: number) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  });

  const toneClass: Record<string, string> = {
    primary: "bg-primary", protein: "bg-emerald-500", carbs: "bg-amber-500", fat: "bg-rose-500",
  };
</script>

<div class="w-full">
  {#if node.kind === "text"}
    <p class="text-sm {node.tone === 'muted' ? 'text-muted-foreground' : node.tone === 'primary' ? 'text-primary' : ''}">{node.text}</p>

  {:else if node.kind === "stat-grid"}
    <div class="grid gap-2" style="grid-template-columns: repeat({Math.min(node.stats.length, 3)}, 1fr)">
      {#each node.stats as s (s.label)}
        <div class="text-center">
          <p class="text-base font-semibold">{s.value}</p>
          <p class="text-[11px] text-muted-foreground">{s.label}</p>
        </div>
      {/each}
    </div>

  {:else if node.kind === "list"}
    <ul class="flex flex-col divide-y divide-border">
      {#each node.items as it (it.label)}
        <li class="flex items-center gap-2 py-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{it.label}</p>
            {#if it.sublabel}<p class="truncate text-xs text-muted-foreground">{it.sublabel}</p>{/if}
          </div>
          {#if it.trailing}<span class="text-xs text-muted-foreground">{it.trailing}</span>{/if}
        </li>
      {/each}
    </ul>

  {:else if node.kind === "progress-rings"}
    <div class="flex justify-around">
      {#each node.rings as r (r.label)}
        {@const pct = r.max > 0 ? Math.min(1, r.value / r.max) : 0}
        <div class="flex flex-col items-center gap-1">
          <svg width="44" height="44" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="18" fill="none" stroke="var(--border)" stroke-width="4" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round"
              stroke-dasharray="{pct * 113} 113" transform="rotate(-90 24 24)" />
          </svg>
          <span class="text-[10px] text-muted-foreground">{r.label}</span>
        </div>
      {/each}
    </div>

  {:else if node.kind === "bar"}
    <div class="flex flex-col gap-2.5">
      {#each node.bars as b (b.label)}
        <div class="flex flex-col gap-1">
          <div class="flex justify-between text-xs">
            <span class="text-muted-foreground">{b.label}</span>
            <span class="font-medium">{b.sublabel ?? Math.round(b.value)}</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full {toneClass[b.tone ?? 'primary']}" style="width: {Math.min(100, (b.value / (b.max ?? b.value)) * 100)}%"></div>
          </div>
        </div>
      {/each}
    </div>

  {:else if node.kind === "line"}
    <svg viewBox="0 0 240 60" class="w-full" height="60" preserveAspectRatio="none">
      {#if node.reference != null}
        <line x1="0" x2="240" y1="30" y2="30" stroke="var(--muted-foreground)" stroke-width="1" stroke-dasharray="3 3" />
      {/if}
      <path d={linePath} fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" />
    </svg>

  {:else if node.kind === "muscle-map"}
    <div class="muscle-map flex justify-center gap-4">
      {#each views as v, i (i)}
        <svg viewBox={v.vb} width="90" height="auto">
          {#each v.m as p (p.id)}<path d={p.path} fill={muscleFill(p.id)} />{/each}
        </svg>
      {/each}
    </div>

  {:else if node.kind === "calendar-heatmap"}
    {@const worked = new Set((node.days ?? []).map((d: any) => d.day))}
    <div class="grid grid-cols-7 gap-1">
      {#each Array(28) as _, i (i)}
        <div class="aspect-square rounded-[3px] {worked.has(i + 1) ? 'bg-primary' : 'bg-muted'}"></div>
      {/each}
    </div>

  {:else if node.kind === "button-row"}
    <div class="flex flex-col gap-2">
      {#each node.buttons as b (b.label)}
        <button class="w-full rounded border px-3 py-2 text-sm {b.primary ? 'bg-primary text-primary-foreground' : 'border-border'}">{b.label}</button>
      {/each}
    </div>

  {:else if node.kind === "checklist"}
    <ul class="flex flex-col divide-y divide-border">
      {#each node.items as it (it.id)}
        <li class="flex w-full items-center gap-3 py-2 {it.muted ? 'opacity-45' : ''}">
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] {it.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}">
            {#if it.checked}✓{/if}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium {it.checked ? 'text-muted-foreground line-through' : ''}">{it.label}</p>
            {#if it.sublabel}<p class="truncate text-xs text-muted-foreground">{it.sublabel}</p>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .muscle-map {
    --muscle-base: oklch(0.28 0.015 260);
    --muscle-low: oklch(0.38 0.14 145);
    --muscle-med: oklch(0.55 0.19 145);
    --muscle-high: oklch(0.72 0.22 145);
  }
  :global(:root:not(.dark)) .muscle-map {
    --muscle-base: oklch(0.8 0.015 260);
    --muscle-low: oklch(0.65 0.13 145);
    --muscle-med: oklch(0.5 0.18 145);
    --muscle-high: oklch(0.35 0.18 145);
  }
  .muscle-map :global(path) {
    stroke: color-mix(in oklch, var(--muscle-base), black 20%);
    stroke-width: 0.15;
  }
</style>
