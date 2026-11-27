<!-- Weeks of a program (canvas PB5): each week's type and what it changes, on top of what the
     progression works out. Replaces "Lighter weeks". The coach's own types ("Peak") are made here
     and offered again for other weeks. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import OptionSelect from "$lib/components/option-select.svelte";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { WEEK_TYPES, weekTypeOf, weekTypeLabel, weekTypeText, type WeekType } from "@logit/core/domain/weekTypes";

  let { open = $bindable(false), program, onset }: { open?: boolean; program: CoachProgram; onset: (weekNumber: number, type: WeekType | null) => void } = $props();

  const weeks = $derived([...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber));
  // The coach's own types used anywhere in this program, offered for every week.
  const own = $derived.by(() => {
    const m = new Map<string, WeekType>();
    for (const w of program.weeks) if (w.type?.kind === "own" && w.type.name) m.set(w.type.name, w.type);
    return [...m.values()];
  });
  const options = $derived([
    ...Object.entries(WEEK_TYPES).map(([k, t]) => ({ value: k, label: t.label })),
    ...own.map((t) => ({ value: `own:${t.name}`, label: t.name! })),
    { value: "new", label: "Your own…" },
  ]);
  const valueOf = (t: WeekType | null) => (!t ? "normal" : t.kind === "own" ? `own:${t.name}` : t.kind);

  // Making your own type for one week.
  let making = $state<number | null>(null);
  let draft = $state<WeekType>({ kind: "own", name: "", setsDelta: 0, loadPct: 0, repsDelta: 0, lastSetAmrap: false, progression: "moves" });
  function pick(weekNumber: number, v: string) {
    if (v === "new") { making = weekNumber; draft = { kind: "own", name: "", setsDelta: 0, loadPct: 0, repsDelta: 0, lastSetAmrap: false, progression: "moves" }; return; }
    if (v.startsWith("own:")) return onset(weekNumber, own.find((t) => t.name === v.slice(4)) ?? null);
    onset(weekNumber, v === "normal" ? null : WEEK_TYPES[v as keyof typeof WEEK_TYPES]);
  }
  function saveOwn() {
    if (making == null || !draft.name?.trim()) return;
    onset(making, { ...draft, name: draft.name.trim() });
    making = null;
  }
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Weeks of {program.name}</Dialog.Title>
      <Dialog.Description>Name each week and say what's different about it. Changes are on top of what the progression works out.</Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid grid-cols-[3.5rem_13rem_minmax(0,1fr)] gap-x-3 px-1 pb-1.5 text-xs text-muted-foreground"><span>Week</span><span>Type</span><span>What changes</span></div>
      {#each weeks as w (w.id)}
        {@const t = weekTypeOf(w)}
        <div class="grid grid-cols-[3.5rem_13rem_minmax(0,1fr)] items-center gap-x-3 border-t border-border px-1 py-2">
          <b class="tabular-nums">{w.weekNumber}</b>
          <OptionSelect size="sm" value={valueOf(t)} aria-label="Week {w.weekNumber} type" {options} onValueChange={(v) => pick(w.weekNumber, v)} />
          <span class="text-[13px] {t ? '' : 'text-muted-foreground'}">{t ? weekTypeText(t) : "The progression decides"}</span>
        </div>
      {/each}
      {#if making != null}
        <section class="mt-3 flex flex-col gap-3 rounded-[10px] border border-border p-3.5">
          <h3 class="text-sm font-semibold">Your own week type, for week {making}</h3>
          <label class="flex flex-col gap-1 text-xs font-medium">Name<Input bind:value={draft.name} placeholder="Peak" maxlength={30} /></label>
          <div class="grid grid-cols-3 gap-3">
            <label class="flex flex-col gap-1 text-xs font-medium">Sets (±)<Input type="number" value={String(draft.setsDelta ?? 0)} oninput={(e) => (draft.setsDelta = num(e.currentTarget.value))} /></label>
            <label class="flex flex-col gap-1 text-xs font-medium">Load (± %)<Input type="number" value={String(draft.loadPct ?? 0)} oninput={(e) => (draft.loadPct = num(e.currentTarget.value))} /></label>
            <label class="flex flex-col gap-1 text-xs font-medium">Reps (±)<Input type="number" value={String(draft.repsDelta ?? 0)} oninput={(e) => (draft.repsDelta = num(e.currentTarget.value))} /></label>
          </div>
          <label class="flex items-center gap-3 text-[13px]"><Switch checked={!!draft.lastSetAmrap} onCheckedChange={(v) => (draft.lastSetAmrap = v)} />Last set as many as you can</label>
          <label class="flex items-center gap-3 text-[13px]"><Switch checked={draft.progression === "pauses"} onCheckedChange={(v) => (draft.progression = v ? "pauses" : "moves")} />The progression pauses this week</label>
          <span class="text-xs text-muted-foreground">{weekTypeText(draft)}</span>
          <span class="flex justify-end gap-2"><Button variant="outline" size="sm" onclick={() => (making = null)}>Cancel</Button><Button size="sm" disabled={!draft.name?.trim()} onclick={saveOwn}>Use it</Button></span>
        </section>
      {/if}
    </div>
    <Dialog.Footer><Button onclick={() => (open = false)}>Done</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
