<script lang="ts">
  import { X, Plus } from "lucide-svelte";

  /** Short how-to points, one per line. Calls onChange with the edited list (blanks kept
   * while typing; the caller trims with cleanCues when it saves). */
  const { cues, onChange, idPrefix = "cue" } = $props<{
    cues: string[];
    onChange: (cues: string[]) => void;
    idPrefix?: string;
  }>();

  function set(i: number, v: string) {
    onChange(cues.map((c: string, j: number) => (j === i ? v : c)));
  }
</script>

<div class="flex flex-col gap-2">
  {#each cues as cue, i (i)}
    <div class="flex items-center gap-2">
      <input
        id="{idPrefix}-{i}"
        type="text"
        class="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        value={cue}
        placeholder="e.g. Elbows under the bar"
        aria-label="Cue {i + 1}"
        oninput={(e) => set(i, (e.currentTarget as HTMLInputElement).value)}
      />
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
        aria-label="Remove cue {i + 1}"
        onclick={() => onChange(cues.filter((_: string, j: number) => j !== i))}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/each}
  <button
    type="button"
    class="inline-flex h-10 items-center gap-1.5 self-start rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground"
    onclick={() => onChange([...cues, ""])}
  >
    <Plus class="h-4 w-4" /> Add cue
  </button>
</div>
