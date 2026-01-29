<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  import { splits } from "$lib/stores/splits.store";
  import { activeSplit } from "$lib/stores/activeSplit.store";

  import { createSplit } from "$lib/domain/WorkoutSplit";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { Badge } from "lucide-svelte";

  const ui = $state({
    loading: true,
    error: null as string | null,
  });

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  async function load() {
    ui.loading = true;
    ui.error = null;

    try {
      await splits.refresh({ limit: 50, sortBy: "updated", order: "desc" });
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load splits";
    } finally {
      ui.loading = false;
    }
  }

  async function newSplit() {
    ui.error = null;
    try {
      const split = createSplit("New Split");
      await saveSplit(split);
      // Optional: make it active on create
      await splits.setActive(split.id);
      await activeSplit.load();

      await goto(`/splits/${split.id}`);
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to create split";
    }
  }

  function openSplit(id: string) {
    void goto(`/splits/${id}`);
  }

  async function setActive(id: string) {
    ui.error = null;
    try {
      await splits.setActive(id);
      await activeSplit.load();
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to set active split";
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="p-3 flex flex-col gap-3">
  <Card.Root class="w-full">
    <Card.Header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <Card.Title>Splits</Card.Title>
          <Card.Description>Build your weekly plan.</Card.Description>
        </div>

        <Button onclick={() => void newSplit()}>New split</Button>
      </div>
    </Card.Header>

    <Card.Content class="flex flex-col gap-3">
      {#if ui.error}
        <p class="text-sm text-destructive">{ui.error}</p>
      {/if}

      {#if ui.loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if $splits.length === 0}
        <p class="text-sm text-muted-foreground">
          No splits yet. Create one to get started.
        </p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each $splits as s (s.id)}
            <li class="rounded-lg border p-3">
              <div class="flex items-start justify-between gap-3">
                <button
                  type="button"
                  class="text-left flex-1 min-w-0"
                  onclick={() => openSplit(s.id)}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <p class="text-sm font-medium truncate">{s.name}</p>

                    {#if $activeSplit?.id === s.id}
                      <Badge>Active</Badge>
                    {/if}
                  </div>

                  <p class="mt-1 text-xs text-muted-foreground">
                    Updated {formatDate(s.updatedAtMs)}
                  </p>

                  <p class="mt-1 text-xs text-muted-foreground">
                    {s.days.length} day{s.days.length === 1 ? "" : "s"}
                  </p>
                </button>

                <div class="flex flex-col gap-2 shrink-0">
                  {#if $activeSplit?.id !== s.id}
                    <Button
                      size="sm"
                      variant="outline"
                      onclick={() => void setActive(s.id)}
                    >
                      Set active
                    </Button>
                  {/if}

                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={() => openSplit(s.id)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
