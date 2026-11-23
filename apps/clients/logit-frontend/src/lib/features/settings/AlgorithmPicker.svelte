<!-- Pick one algorithm from a list (progression, mobility, muscle groups, analytics): the active one
     is marked, the others have Select, and ones with options get a settings button. -->
<script lang="ts">
  import { Settings2 } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";

  type Algo = { id: string; name: string; description: string; author?: string; hasPreferences?: boolean };
  const {
    algorithms,
    activeId,
    saving,
    loading,
    error,
    onselect,
    settingsHref,
  }: {
    algorithms: Algo[];
    activeId: string | null | undefined;
    saving: boolean;
    loading: boolean;
    error: string | null;
    onselect: (id: string) => void;
    /** Where an algorithm's settings button goes, if it has one. */
    settingsHref?: (algo: Algo) => string | null;
  } = $props();
</script>

{#if error}
  <p class="px-3 py-3 text-sm text-destructive">{error}</p>
{/if}
{#if loading}
  <p class="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
{:else if algorithms.length === 0}
  <p class="px-3 py-3 text-sm text-muted-foreground">None available.</p>
{:else}
  {#each algorithms as algo (algo.id)}
    {@const isActive = activeId === algo.id}
    {@const href = settingsHref?.(algo) ?? null}
    <div class="flex items-start gap-3 px-3 py-3 transition-colors {isActive ? 'bg-primary/5' : ''}">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="text-[15px] font-medium">{algo.name}</p>
          {#if isActive}
            <span class="rounded-md border border-primary px-1.5 py-0.5 text-xs font-medium text-primary">Active</span>
          {/if}
        </div>
        <p class="mt-1 text-[13px] leading-snug text-muted-foreground">{algo.description}</p>
        {#if algo.author}<p class="mt-1 text-xs text-muted-foreground">by {algo.author}</p>{/if}
      </div>
      <div class="flex shrink-0 items-center gap-2">
        {#if href}
          <Button size="sm" variant="ghost" class="h-11 w-11 p-0 text-muted-foreground hover:text-foreground"
            title="Settings" aria-label="{algo.name} settings" onclick={() => goto(href)}>
            <Settings2 class="h-4 w-4" />
          </Button>
        {/if}
        {#if !isActive}
          <Button size="sm" variant="outline" disabled={saving} onclick={() => onselect(algo.id)}>Select</Button>
        {/if}
      </div>
    </div>
  {/each}
{/if}
