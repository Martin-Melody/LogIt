<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";

  const { saving = false, error = null, startedAtMs = null } = $props<{
    saving?: boolean;
    error?: string | null;
    startedAtMs?: number | null;
  }>();

  let now = $state(Date.now());

  $effect(() => {
    if (startedAtMs == null) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const elapsedLabel = $derived.by(() => {
    if (startedAtMs == null) return null;
    const total = Math.max(0, Math.floor((now - startedAtMs) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  });
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b border-border">
  <button
    type="button"
    class="shrink-0 text-muted-foreground hover:text-foreground -ml-1 p-1"
    onclick={() => back("/")}
    aria-label="Back"
  >
    <ArrowLeft class="h-4 w-4" />
  </button>

  <h1 class="flex-1 text-base font-semibold">Workout</h1>

  {#if saving}
    <span class="text-xs text-muted-foreground shrink-0">Saving…</span>
  {:else if elapsedLabel}
    <span
      class="text-xs text-muted-foreground shrink-0 tabular-nums"
      aria-label="Elapsed workout time"
    >
      {elapsedLabel}
    </span>
  {/if}
</div>

{#if error}
  <p class="px-3 py-1.5 text-sm text-destructive border-b border-border">{error}</p>
{/if}
