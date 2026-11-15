<script lang="ts">
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import { MUSCLE_LABEL } from "@logit/core/domain/library";

  /** Tap a muscle once for "main", again for "also works", again to clear. */
  const { primary, secondary, onChange } = $props<{
    primary: MuscleGroup[];
    secondary: MuscleGroup[];
    onChange: (next: { primary: MuscleGroup[]; secondary: MuscleGroup[] }) => void;
  }>();

  const ALL = Object.keys(MUSCLE_LABEL) as MuscleGroup[];

  function cycle(m: MuscleGroup) {
    if (primary.includes(m)) {
      onChange({ primary: primary.filter((x: MuscleGroup) => x !== m), secondary: [...secondary, m] });
    } else if (secondary.includes(m)) {
      onChange({ primary, secondary: secondary.filter((x: MuscleGroup) => x !== m) });
    } else {
      onChange({ primary: [...primary, m], secondary });
    }
  }

  function state(m: MuscleGroup): "primary" | "secondary" | "none" {
    return primary.includes(m) ? "primary" : secondary.includes(m) ? "secondary" : "none";
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap gap-1.5">
    {#each ALL as m (m)}
      {@const s = state(m)}
      <button
        type="button"
        class="inline-flex h-9 items-center rounded-full border px-3 text-sm capitalize transition-colors {s === 'primary'
          ? 'border-primary bg-primary text-primary-foreground'
          : s === 'secondary'
            ? 'border-primary/60 bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground'}"
        aria-label="{MUSCLE_LABEL[m]}: {s === 'primary' ? 'main muscle' : s === 'secondary' ? 'also works' : 'not used'}"
        onclick={() => cycle(m)}
      >
        {MUSCLE_LABEL[m]}{#if s === "secondary"}<span class="ml-1 text-xs text-muted-foreground">·2nd</span>{/if}
      </button>
    {/each}
  </div>
  <p class="text-xs text-muted-foreground">Tap once for a main muscle, twice for one it also works.</p>
</div>
