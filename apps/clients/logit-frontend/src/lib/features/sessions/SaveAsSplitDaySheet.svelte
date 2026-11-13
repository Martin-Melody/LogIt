<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner/index";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
  import { createId } from "@logit/core/domain/ids";
  import { sessionToSplitDay } from "@logit/core/domain/sessionHistory";
  import { splitDayChanges, splitDayTitleFor } from "./saveAsSplitDay";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";

  // Save a past workout into a split: as a new day, or over one of its days. The day it
  // came from is picked to start with.
  const {
    open,
    session,
    title,
    splits,
    activeSplitId = null,
    replaceDayId = null,
    onOpenChange,
    onSaved,
  }: {
    open: boolean;
    session: WorkoutSession;
    /** What the workout is called; the name a new day gets. */
    title: string;
    splits: WorkoutSplit[];
    activeSplitId?: string | null;
    /** Start with "replace this day" picked. */
    replaceDayId?: string | null;
    onOpenChange: (v: boolean) => void;
    onSaved?: (split: WorkoutSplit) => void;
  } = $props();

  const usable = $derived(splits.filter((s) => !s.archived));

  let splitId = $state<string>("");
  let target = $state<string>("new");
  let saving = $state(false);

  // Fresh choices each time it opens.
  $effect(() => {
    if (!open) return;
    const fromId = session.source?.kind === "split" ? session.source.parentId : null;
    const start = usable.find((s) => s.id === fromId) ?? usable.find((s) => s.id === activeSplitId) ?? usable[0];
    splitId = start?.id ?? "";
    const want = replaceDayId ?? (start?.id === fromId ? session.source?.dayId : null);
    target = want && start?.days.some((d) => d.id === want) ? want : "new";
  });

  const split = $derived(usable.find((s) => s.id === splitId) ?? null);
  const days = $derived(split ? [...split.days].filter((d) => !d.rest).sort((a, b) => a.orderIndex - b.orderIndex) : []);
  const fromDayId = $derived(session.source?.kind === "split" && session.source.parentId === splitId ? session.source.dayId : null);

  function pickSplit(id: string) {
    splitId = id;
    target = "new";
  }

  async function save() {
    if (!split || saving) return;
    saving = true;
    try {
      let next: WorkoutSplit;
      if (target === "new") {
        const day = sessionToSplitDay(session, { id: createId("day"), orderIndex: split.days.length, name: title });
        next = { ...split, days: [...split.days, day] };
      } else {
        const old = split.days.find((d) => d.id === target);
        if (!old) return;
        // Keep the day's place, name and schedule; only what's in it changes.
        const day = sessionToSplitDay(session, {
          id: old.id,
          orderIndex: old.orderIndex,
          name: old.name,
          weekday: old.weekday,
          sameDayAsPrevious: old.sameDayAsPrevious,
        });
        next = { ...split, days: split.days.map((d) => (d.id === old.id ? day : d)) };
      }
      await saveSplit(next);
      toast.success(target === "new" ? `Added to ${split.name}` : `${splitDayTitleFor(split, target)} updated`);
      onSaved?.(next);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the split");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
    <Dialog.Header class="px-5 pt-5 pb-3 pr-12 text-left">
      <Dialog.Title>Save as a split day</Dialog.Title>
      <Dialog.Description>
        Saves the exercises, sets and supersets from this workout. Weights keep coming from progression.
      </Dialog.Description>
    </Dialog.Header>

    {#if usable.length === 0}
      <p class="px-5 pb-5 text-sm text-muted-foreground">You don't have a split yet. Make one on the Splits page first.</p>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-muted-foreground">Split</span>
          <Select.Root type="single" value={splitId} onValueChange={(v) => pickSplit(v)}>
            <Select.Trigger class="w-full">
              {split?.name ?? "Pick a split"}{#if split?.id === activeSplitId}<span class="ml-2 rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">Active</span>{/if}
            </Select.Trigger>
            <Select.Content>
              {#each usable as s (s.id)}
                <Select.Item value={s.id} label={s.name} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <fieldset class="mt-4 flex flex-col">
          <legend class="mb-1 text-xs font-medium text-muted-foreground">Where</legend>
          <label class="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border/60 text-sm">
            <input type="radio" name="save-target" class="size-[18px] accent-primary" value="new" bind:group={target} />
            <span>Add as a new day <span class="text-muted-foreground">· {title}</span></span>
          </label>
          {#if days.length}
            <p class="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Or replace</p>
            {#each days as d (d.id)}
              {@const changes = d.id === fromDayId ? splitDayChanges(session, d) : null}
              <label class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border/60 py-1.5 text-sm">
                <input type="radio" name="save-target" class="size-[18px] accent-primary" value={d.id} bind:group={target} />
                <span class="flex min-w-0 flex-col">
                  <span class={d.id === fromDayId ? "font-medium" : ""}>{splitDayTitleFor(split!, d.id)}</span>
                  {#if d.id === fromDayId}
                    <span class="text-xs text-muted-foreground">This workout came from it{changes ? ` · ${changes}` : ""}</span>
                  {/if}
                </span>
              </label>
            {/each}
          {/if}
        </fieldset>
      </div>

      <div class="flex gap-2 border-t border-border px-5 pt-3 pb-4">
        <Button variant="outline" class="flex-1" onclick={() => onOpenChange(false)}>Cancel</Button>
        <Button class="flex-[1.6]" disabled={!split || saving} onclick={() => void save()}>
          {saving ? "Saving…" : target === "new" ? "Add day" : `Replace ${split ? splitDayTitleFor(split, target).split(" — ")[0] : "day"}`}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
