<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Search, X } from "lucide-svelte";

  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { durationMs, formatDuration } from "@logit/core/domain/time";
  import { getTopSetHighlight, getExercises } from "@logit/core/domain/workout";

  const ui = $state({ loading: true, error: null as string | null });
  let query = $state("");

  function dateLabel(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  const allSummaries = $derived(
    ($recentSessions ?? []).map((s) => {
      const ended = s.endedAtMs ?? s.startedAtMs;
      const dur = s.endedAtMs ? durationMs(s.startedAtMs, s.endedAtMs) : 0;
      const top = getTopSetHighlight(s);
      return {
        id: s.id,
        dateLabel: dateLabel(ended),
        durationLabel: s.endedAtMs ? formatDuration(dur) : "In progress",
        exerciseCount: getExercises(s).length,
        topSet: top ? `${top.exerciseName} ${top.reps}×${top.weight}kg` : null,
      };
    }),
  );

  const summaries = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSummaries;
    return allSummaries.filter(
      (s) =>
        s.dateLabel.toLowerCase().includes(q) ||
        s.topSet?.toLowerCase().includes(q),
    );
  });

  onMount(async () => {
    ui.loading = true;
    ui.error = null;
    try {
      await recentSessions.refresh(50);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      ui.loading = false;
    }
  });
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center justify-between px-3 py-3 border-b border-border">
    <h1 class="text-base font-semibold">Sessions</h1>
  </div>

  <div class="relative px-3 py-2 border-b border-border">
    <Search class="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    <input
      type="text"
      placeholder="Search by date or exercise…"
      bind:value={query}
      class="w-full rounded border border-border bg-background pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
    {#if query}
      <button
        type="button"
        class="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onclick={() => (query = "")}
        aria-label="Clear search"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    {/if}
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if ui.error}
    <div class="px-3 py-4 flex flex-col gap-2">
      <p class="text-sm text-destructive">{ui.error}</p>
      <button
        type="button"
        class="text-sm underline-offset-2 hover:underline text-left w-fit"
        onclick={() => void recentSessions.refresh(50)}
      >
        Retry
      </button>
    </div>
  {:else if summaries.length === 0}
    <p class="px-3 py-8 text-sm text-muted-foreground text-center">
      {query.trim() ? "No sessions match your search." : "No sessions yet."}
    </p>
  {:else}
    <ul class="divide-y divide-border">
      {#each summaries as s (s.id)}
        <li>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
            onclick={() => void goto(`/sessions/${s.id}`)}
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{s.dateLabel}</span>
                <span class="text-xs text-muted-foreground">{s.durationLabel}</span>
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                {s.exerciseCount} exercise{s.exerciseCount === 1 ? "" : "s"}
                {#if s.topSet}· {s.topSet}{/if}
              </p>
            </div>
            <span class="text-muted-foreground text-sm shrink-0">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
