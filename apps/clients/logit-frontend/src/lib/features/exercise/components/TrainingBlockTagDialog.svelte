<script lang="ts">
  // Tag training blocks (adaptive-progression-engine.md §10.3.3) — mark a
  // period of an exercise's history with a reason (injury, tempo/technique
  // change, deliberate variation, other) so it doesn't leave an
  // undifferentiated mark on the trend. Shared by both creation surfaces
  // Martin asked for: the exercise detail page (arbitrary date range) and
  // session edit (mark this exercise, in this session, in the moment) — same
  // dialog, just seeded with a different initial date range.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import DateField from "$lib/components/ui/date-field";
  import { Tag, Trash2 } from "lucide-svelte";
  import { createTrainingBlockTag } from "@logit/core/usecases/progression/createTrainingBlockTag";
  import { closeTrainingBlockTag } from "@logit/core/usecases/progression/closeTrainingBlockTag";
  import { deleteTrainingBlockTag } from "@logit/core/usecases/progression/deleteTrainingBlockTag";
  import type { TrainingBlockTag, TrainingBlockTagReason } from "@logit/core/domain/trainingBlockTag";
  import { exerciseKey } from "@logit/core/domain/progression";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";

  const {
    exercise,
    initialStartIso,
    initialEndIso,
    triggerLabel = "Tag training block",
    triggerVariant = "outline",
    onSaved,
  }: {
    exercise: { id?: string; name: string };
    /** Seeds the form's date range — e.g. session edit passes the session's
     * own date so "mark this session" is a one-field flow. */
    initialStartIso?: string;
    initialEndIso?: string;
    triggerLabel?: string;
    triggerVariant?: "outline" | "ghost" | "secondary";
    /** Called after a tag is created, closed, or deleted — lets the caller
     * (e.g. the progression panel) refresh its own story/trend view. */
    onSaved?: () => void;
  } = $props();

  const REASON_LABELS: Record<TrainingBlockTagReason, string> = {
    injury: "Injury",
    "tempo-technique-change": "Tempo/technique change",
    "deliberate-variation": "Deliberate variation",
    other: "Other",
  };

  let open = $state(false);
  let tags = $state<TrainingBlockTag[]>([]);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let reason = $state<TrainingBlockTagReason>("injury");
  let startIso = $state(initialStartIso ?? isoOf(Date.now()));
  let ongoing = $state(!initialEndIso);
  let endIso = $state(initialEndIso ?? isoOf(Date.now()));
  let note = $state("");

  function isoOf(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function msOf(iso: string, endOfDay: boolean): number {
    return new Date(`${iso}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`).getTime();
  }

  async function refresh() {
    loading = true;
    tags = await getProgressionDeps().trainingBlockTagRepo.listForExercise(exerciseKey(exercise));
    loading = false;
  }

  $effect(() => {
    if (open) void refresh();
  });

  async function handleCreate() {
    error = null;
    if (reason === "other" && !note.trim()) {
      error = 'A note is required when the reason is "other".';
      return;
    }
    saving = true;
    try {
      await createTrainingBlockTag(
        {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          startMs: msOf(startIso, false),
          endMs: ongoing ? undefined : msOf(endIso, true),
          reason,
          note: note.trim() || undefined,
        },
        getProgressionDeps(),
      );
      note = "";
      await refresh();
      onSaved?.();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save that tag.";
    } finally {
      saving = false;
    }
  }

  async function handleClose(tag: TrainingBlockTag) {
    await closeTrainingBlockTag(exerciseKey(exercise), tag.id, getProgressionDeps());
    await refresh();
    onSaved?.();
  }

  async function handleDelete(tag: TrainingBlockTag) {
    await deleteTrainingBlockTag(tag.id, getProgressionDeps());
    await refresh();
    onSaved?.();
  }

  function fmt(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    data-variant={triggerVariant}
  >
    <Tag class="h-3 w-3" />
    {triggerLabel}
  </Dialog.Trigger>

  <Dialog.Content class="sm:max-w-[420px]">
    <Dialog.Header>
      <Dialog.Title>Tag a training block</Dialog.Title>
      <Dialog.Description>
        Mark a period so it doesn't count as a normal progression signal — e.g. an injury layoff or a
        deliberate tempo change.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4">
      {#if !loading && tags.length > 0}
        <div class="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
          {#each tags as tag (tag.id)}
            <div class="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-xs">
              <div class="min-w-0">
                <p class="font-medium truncate">
                  {REASON_LABELS[tag.reason]}
                  {#if tag.note}<span class="text-muted-foreground font-normal"> · {tag.note}</span>{/if}
                </p>
                <p class="text-muted-foreground">
                  {fmt(tag.startMs)} – {tag.endMs ? fmt(tag.endMs) : "ongoing"}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                {#if !tag.endMs}
                  <button type="button" class="underline underline-offset-2" onclick={() => handleClose(tag)}>
                    End it
                  </button>
                {/if}
                <button
                  type="button"
                  aria-label="Delete tag"
                  class="text-muted-foreground hover:text-destructive"
                  onclick={() => handleDelete(tag)}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <Label for="tbt-reason">Reason</Label>
          <Select.Root type="single" bind:value={reason}>
            <Select.Trigger id="tbt-reason" class="w-full">{REASON_LABELS[reason]}</Select.Trigger>
            <Select.Content>
              {#each Object.entries(REASON_LABELS) as [value, label] (value)}
                <Select.Item {value} {label} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="flex items-end gap-3">
          <div class="flex flex-col gap-1.5">
            <Label>From</Label>
            <DateField bind:value={startIso} maxIso={isoOf(Date.now())} aria-label="Start date" />
          </div>
          {#if !ongoing}
            <div class="flex flex-col gap-1.5">
              <Label>To</Label>
              <DateField bind:value={endIso} minIso={startIso} maxIso={isoOf(Date.now())} aria-label="End date" />
            </div>
          {/if}
        </div>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" bind:checked={ongoing} class="h-3.5 w-3.5" />
          Still ongoing — I'm not sure when this ends yet
        </label>

        <div class="flex flex-col gap-1.5">
          <Label for="tbt-note">Note {reason === "other" ? "(required)" : "(optional)"}</Label>
          <Textarea id="tbt-note" bind:value={note} rows={2} placeholder="e.g. shoulder strain, recovering" />
        </div>

        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Close</Button>
      <Button onclick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Add tag"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
