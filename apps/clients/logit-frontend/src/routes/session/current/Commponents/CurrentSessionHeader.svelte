<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";

  const { saving = false, error = null } = $props<{
    saving?: boolean;
    error?: string | null;
  }>();
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

  <span class="text-xs text-muted-foreground shrink-0">
    {#if saving}Saving…{/if}
  </span>
</div>

{#if error}
  <p class="px-3 py-1.5 text-sm text-destructive border-b border-border">{error}</p>
{/if}
