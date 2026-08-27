<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Trash, Plus } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import type { CheckinSchedule, CheckinCadence, CheckinQuestionType } from "@logit/core/domain/Checkin";
  import * as C from "@logit/core/domain/Checkin";
  import { getAuthoredCheckinRepo } from "$lib/data/repoProvider";
  import { saveAuthoredCheckin } from "$lib/usecases/coach/saveAuthoredCheckin";
  import { deleteAuthoredCheckin } from "$lib/usecases/coach/deleteAuthoredCheckin";

  const props = $props<{ params: { id: string; scheduleId: string } }>();
  const clientId = $derived(props.params.id);
  const scheduleId = $derived(props.params.scheduleId);
  const username = $derived($page.url.searchParams.get("u") ?? "");

  const ui = $state({ loading: true, saving: false, error: null as string | null });
  let schedule = $state<CheckinSchedule | null>(null);

  const cadences: CheckinCadence[] = ["weekly", "biweekly", "monthly", "manual"];
  const qTypes: { v: CheckinQuestionType; l: string }[] = [
    { v: "text", l: "Text" }, { v: "number", l: "Number" }, { v: "scale", l: "Scale 1–10" },
    { v: "weight", l: "Bodyweight" }, { v: "boolean", l: "Yes / No" }, { v: "photo", l: "Photo" },
  ];

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      schedule = (await getAuthoredCheckinRepo().getMySchedule(scheduleId))?.schedule ?? null;
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      ui.loading = false;
    }
  }

  async function run(fn: (s: CheckinSchedule) => CheckinSchedule) {
    if (!schedule) return;
    ui.saving = true;
    ui.error = null;
    try {
      schedule = await saveAuthoredCheckin(fn(schedule));
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      ui.saving = false;
    }
  }

  async function removeSchedule() {
    await deleteAuthoredCheckin(scheduleId);
    back(`/clients/${clientId}?u=${username}`);
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back(`/clients/${clientId}?u=${username}`)}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    {#if schedule}
      <input
        class="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none border-b border-transparent focus:border-primary"
        value={schedule.name}
        disabled={ui.saving}
        onblur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== schedule?.name) void run((s) => C.renameCheckinSchedule(s, v)); }}
      />
      <ConfirmDialog title="Delete this check-in?" description="Removes it for you and the client." confirmLabel="Delete" cancelLabel="Cancel" saving={ui.saving} onConfirm={removeSchedule}>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" class="h-7 w-7 text-destructive" disabled={ui.saving}>
            <Trash class="h-3.5 w-3.5" />
          </Button>
        {/snippet}
      </ConfirmDialog>
    {/if}
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !schedule}
    <p class="px-3 py-4 text-sm text-muted-foreground">Check-in not found.</p>
  {:else}
    <div class="px-3 py-2 border-b border-border flex items-center gap-2 text-sm">
      <span class="text-muted-foreground">Cadence</span>
      <select value={schedule.cadence} class="rounded border bg-background px-2 py-1 text-sm"
        onchange={(e) => void run((s) => C.setCadence(s, e.currentTarget.value as CheckinCadence))}>
        {#each cadences as c}<option value={c} class="capitalize">{c}</option>{/each}
      </select>
      <span class="ml-auto text-xs text-muted-foreground">{ui.saving ? "saving…" : "saved"}</span>
    </div>

    <div class="divide-y divide-border">
      {#each schedule.questions as q (q.id)}
        <div class="px-3 py-2.5 flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <input
              class="flex-1 min-w-0 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-primary"
              value={q.prompt}
              disabled={ui.saving}
              onblur={(e) => { const v = e.currentTarget.value.trim(); if (v !== q.prompt) void run((s) => C.updateQuestion(s, q.id, { prompt: v })); }}
            />
            <button type="button" class="p-1 text-muted-foreground hover:text-destructive" disabled={ui.saving}
              onclick={() => void run((s) => C.removeQuestion(s, q.id))}>
              <Trash class="h-3.5 w-3.5" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <select value={q.type} class="rounded border bg-background px-1.5 py-0.5 text-xs"
              onchange={(e) => void run((s) => C.updateQuestion(s, q.id, { type: e.currentTarget.value as CheckinQuestionType }))}>
              {#each qTypes as t}<option value={t.v}>{t.l}</option>{/each}
            </select>
            <label class="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={q.required ?? false} disabled={ui.saving}
                onchange={(e) => void run((s) => C.updateQuestion(s, q.id, { required: e.currentTarget.checked }))} />
              Required
            </label>
          </div>
        </div>
      {/each}
    </div>

    <button type="button" class="flex items-center gap-1.5 px-3 py-3 text-sm text-primary hover:underline"
      disabled={ui.saving} onclick={() => void run((s) => C.addQuestion(s))}>
      <Plus class="h-3.5 w-3.5" /> Add question
    </button>
  {/if}
</div>
