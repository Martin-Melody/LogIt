<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { startSplitsTour } from "$lib/tour/index";
  import { Plus } from "lucide-svelte";

  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import { splits } from "$lib/stores/splits.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { assignedPrograms } from "$lib/stores/assignedPrograms.store";

  import { createSplit } from "@logit/core/domain/WorkoutSplit";
  import { getCurrentWeek } from "@logit/core/domain/CoachProgram";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { getCheckinRepo } from "$lib/data/repoProvider";

  let checkinCount = $state(0);

  const ui = $state({
    loading: true,
    creating: false,
    error: null as string | null,
    settingActive: null as string | null,
  });

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      await Promise.all([
        splits.refresh({ limit: 50, sortBy: "updated", order: "desc" }),
        activeSplit.load(),
        assignedPrograms.refresh(),
        getCheckinRepo().listAssignedSchedules().then((s) => (checkinCount = s.length)).catch(() => {}),
      ]);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load splits";
    } finally {
      ui.loading = false;
    }
  }

  async function newSplit() {
    if (ui.creating) return;
    ui.creating = true;
    ui.error = null;
    try {
      const split = createSplit("New Split");
      await saveSplit(split);
      await splits.setActive(split.id);
      await activeSplit.load();
      await goto(`/splits/${split.id}`);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to create split";
      ui.creating = false;
    }
  }

  async function setActive(id: string, e: MouseEvent) {
    e.stopPropagation();
    ui.settingActive = id;
    ui.error = null;
    try {
      await splits.setActive(id);
      await activeSplit.load();
    } catch (err) {
      ui.error = err instanceof Error ? err.message : "Failed to set active";
    } finally {
      ui.settingActive = null;
    }
  }

  onMount(() => {
    void load();
    setTimeout(() => startSplitsTour(), 400);
  });
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center justify-between px-3 py-3 border-b border-border">
    <h1 class="text-base font-semibold">Splits</h1>
    <Button size="sm" disabled={ui.creating} data-tour="splits-new" onclick={() => void newSplit()}>
      <Plus class="h-3.5 w-3.5 mr-1" />
      New
    </Button>
  </div>

  {#if ui.error}
    <p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>
  {/if}

  {#if !ui.loading && (($assignedPrograms.length > 0) || checkinCount > 0)}
    <div class="border-b border-border">
      <p class="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        From your coach
      </p>
      <ul class="divide-y divide-border">
        {#if checkinCount > 0}
          <li>
            <button type="button"
              class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onclick={() => void goto('/checkins')}>
              <div class="min-w-0 flex-1">
                <span class="text-sm font-medium">Check-ins</span>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {checkinCount} check-in{checkinCount === 1 ? "" : "s"} from your coach
                </p>
              </div>
              <span class="text-muted-foreground text-sm shrink-0">›</span>
            </button>
          </li>
        {/if}
        {#each $assignedPrograms as p (p.id)}
          {@const week = getCurrentWeek(p)}
          <li>
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onclick={() => void goto(`/programs/${p.id}`)}
            >
              <div class="min-w-0 flex-1">
                <span class="text-sm font-medium truncate">{p.name}</span>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {p.weeks.length} week{p.weeks.length === 1 ? "" : "s"}
                  {#if week} · currently week {week.weekNumber}{/if}
                </p>
              </div>
              <span class="text-muted-foreground text-sm shrink-0">›</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if $splits.length === 0}
    <div class="px-3 py-8 flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-muted-foreground">No splits yet.</p>
      <Button variant="outline" onclick={() => void newSplit()}>Create your first split</Button>
    </div>
  {:else}
    <ul class="divide-y divide-border">
      {#each $splits as s (s.id)}
        <li class="flex items-center hover:bg-muted/40 active:bg-muted/60 transition-colors">
          <button
            type="button"
            class="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left"
            onclick={() => void goto(`/splits/${s.id}`)}
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium truncate">{s.name}</span>
                {#if $activeSplit?.id === s.id}
                  <Badge variant="secondary" class="text-xs px-1.5 py-0 shrink-0">Active</Badge>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                {s.days.length} day{s.days.length === 1 ? "" : "s"} · updated {formatDate(s.updatedAtMs)}
              </p>
            </div>
          </button>

          <div class="flex items-center gap-2 shrink-0 pr-3">
            {#if $activeSplit?.id !== s.id}
              <button
                type="button"
                data-tour="splits-set-active"
                class="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-3"
                disabled={ui.settingActive === s.id}
                onclick={(e) => void setActive(s.id, e)}
              >
                {ui.settingActive === s.id ? "…" : "Set active"}
              </button>
            {/if}
            <span class="text-muted-foreground text-sm">›</span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
