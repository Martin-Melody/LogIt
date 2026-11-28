<!-- The fields of a stretch of weeks (canvas PW1, PW3): weeks from–to, a name, and what they do.
     In the stretch dialog and inline when a new program sets up its weeks. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import OptionSelect from "$lib/components/option-select.svelte";
  import RulePickerDialog from "./RulePickerDialog.svelte";
  import { ruleLabel, weekRangeText, type CoachProgram, type ProgramRule } from "@logit/core/domain/CoachProgram";
  import { WEEK_TYPES, weekTypeText, type WeekType } from "@logit/core/domain/weekTypes";
  import { stretchTitle, type Stretch, type StretchInput, type StretchWhat } from "@logit/core/domain/stretches";
  import type { StretchPack } from "./StretchDialog.svelte";

  let { program, stretch, start, packs = [], input = $bindable(null), placeholder = $bindable("") }: {
    program: CoachProgram;
    /** The stretch being changed; null for a new one starting at `start`. */
    stretch: Stretch | null;
    start?: { from: number; to: number };
    packs?: StretchPack[];
    /** What it comes to, or null while it isn't complete (a new week type with no name). */
    input?: StretchInput | null;
    placeholder?: string;
  } = $props();

  type Choice = "find" | "max" | "progression" | "week" | `pack:${string}`;
  // Canvas PX4: the lifts a max test runs on (ticked by default: the barbell ones).
  const liftsHere = $derived.by(() => {
    const week = program.weeks.find((w) => w.weekNumber === from) ?? program.weeks[0];
    const names: string[] = [];
    for (const d of [...(week?.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex))
      for (const b of [...d.blocks].sort((a, c) => a.orderIndex - c.orderIndex))
        if (b.type === "strength" && (b.measure ?? "weight") === "weight" && (!b.weeks || (from >= b.weeks.from && from <= b.weeks.to)) && !names.includes(b.exerciseName)) names.push(b.exerciseName);
    return names;
  });
  const barbell = (n: string) => /squat|bench|deadlift|overhead press|\bpress\b|row|clean|snatch/i.test(n) && !/dumbbell|cable|machine|smith|kettlebell|band/i.test(n);
  let lifts = $state<string[] | null>(null);
  const ticked = $derived(lifts ?? liftsHere.filter(barbell));
  let from = $state(1);
  let to = $state(1);
  let name = $state("");
  let choice = $state<Choice>("progression");
  let rule = $state<ProgramRule | undefined>(undefined);
  let weekValue = $state("deload");
  let own = $state<WeekType>({ kind: "own", name: "", setsDelta: 0, loadPct: 0, repsDelta: 0, lastSetAmrap: false, progression: "moves" });
  let picking = $state(false);

  // The coach's own week types in this program, offered again.
  const owns = $derived.by(() => {
    const m = new Map<string, WeekType>();
    for (const w of program.weeks) if (w.type?.kind === "own" && w.type.name) m.set(w.type.name, w.type);
    return [...m.values()];
  });
  const weekOptions = $derived([
    ...(["deload", "intro", "heavy", "test"] as const).map((k) => ({ value: k, label: WEEK_TYPES[k].label })),
    ...owns.map((t) => ({ value: `own:${t.name}`, label: t.name! })),
    { value: "new", label: "Your own…" },
  ]);

  // Filled once from what it's given; the parent re-creates it ({#key}) for another stretch.
  init();
  function init() {
    const s = stretch;
    from = s?.from ?? start?.from ?? 1;
    to = s?.to ?? start?.to ?? from;
    name = s?.name ?? "";
    rule = undefined;
    const w = s?.what;
    if (!w) choice = "progression";
    else if (w.kind === "find") choice = "find";
    else if (w.kind === "max") { choice = "max"; lifts = w.lifts ?? null; }
    else if (w.kind === "pack") choice = `pack:${w.pack.id}`;
    else if (w.kind === "week") {
      choice = "week";
      weekValue = w.type.kind === "own" ? `own:${w.type.name}` : w.type.kind;
    } else { choice = "progression"; rule = w.rule; }
  }

  const total = $derived(program.weeks.length);
  const weekSel = (lo: number) => Array.from({ length: Math.max(0, total - lo + 1) }, (_, i) => ({ value: String(lo + i), label: String(lo + i) }));

  function what(): StretchWhat | null {
    if (choice === "find") return { kind: "find" };
    if (choice === "max") return ticked.length ? { kind: "max", lifts: ticked } : null;
    if (choice === "progression") return { kind: "progression", ...(rule ? { rule } : {}) };
    if (choice === "week") {
      if (weekValue === "new") return own.name?.trim() ? { kind: "week", type: { ...own, name: own.name.trim() } } : null;
      if (weekValue.startsWith("own:")) { const t = owns.find((x) => x.name === weekValue.slice(4)); return t ? { kind: "week", type: t } : null; }
      const { label: _l, text: _t, ...type } = WEEK_TYPES[weekValue as "deload"];
      return { kind: "week", type };
    }
    const pk = packs.find((p) => `pack:${p.pluginId}` === choice);
    if (!pk) return stretch?.what.kind === "pack" ? stretch.what : null;
    return { kind: "pack", pack: { id: pk.pluginId, name: pk.name }, findsWeights: pk.phase.findsWeights, ...(pk.phase.block ? { blockPluginId: pk.phase.block } : {}), ...(pk.phase.progression ? { rule: { kind: "plugin", pluginId: pk.phase.progression, name: pk.phase.name } } : {}) };
  }
  $effect(() => { const w = what(); input = w ? { from, to, ...(name.trim() ? { name: name.trim() } : {}), what: w } : null; });
  $effect(() => { const w = what(); placeholder = w ? stretchTitle({ from, to, what: w }) : "Name"; });
  const KINDS = $derived<{ id: Choice; title: string; text: string }[]>([
    { id: "find", title: "Find your weights", text: "LogIt's Weight finder on each lift. The next stretch plans from what they find; you check the numbers on Today first." },
    { id: "max", title: "Find your max", text: "Heavy singles on the lifts you tick, with “how much more was there?” after each. Their new maxes go next to where they started, on your Today." },
    { id: "progression", title: "A progression", text: rule ? ruleLabel(rule) : `The program's: ${ruleLabel(program.rule)}` },
    ...packs.map((p) => ({ id: `pack:${p.pluginId}` as Choice, title: p.phase.name, text: `${p.description} From ${p.name}.` })),
    ...(stretch?.what.kind === "pack" && !packs.some((p) => p.pluginId === (stretch.what as { pack: { id: string } }).pack.id) ? [{ id: `pack:${stretch.what.pack.id}` as Choice, title: stretch.what.pack.name, text: "From a pack" }] : []),
    { id: "week", title: "A kind of week", text: "Deload, intro, heavy, test or your own: on top of the progression it's in." },
  ]);
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
</script>

<div class="flex flex-col gap-3.5">
        <div class="flex items-center gap-2 text-sm">
          <b>Weeks</b>
          <OptionSelect size="sm" value={String(from)} aria-label="From week" options={weekSel(1)} onValueChange={(v) => { from = Number(v); if (to < from) to = from; }} />
          <b>to</b>
          <OptionSelect size="sm" value={String(to)} aria-label="To week" options={weekSel(from)} onValueChange={(v) => (to = Number(v))} />
          <span class="text-xs text-muted-foreground">of {total}</span>
        </div>
        <div class="flex flex-col gap-1.5"><Label for="st-name">Name <span class="font-normal text-muted-foreground">optional</span></Label><Input id="st-name" bind:value={name} placeholder={placeholder} maxlength={40} /></div>
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="What they do">
          <span class="text-sm font-medium">What they do</span>
          {#each KINDS as k (k.id)}
            <div class="flex flex-col gap-2 rounded-[10px] border px-3.5 py-2.5 transition-colors {choice === k.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'}">
              <button type="button" role="radio" aria-checked={choice === k.id} onclick={() => (choice = k.id)} class="flex flex-col gap-0.5 text-left">
                <span class="text-[13px] font-semibold">{k.title}</span><span class="text-xs text-muted-foreground">{k.text}</span>
              </button>
              {#if choice === k.id && k.id === "max"}
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Lifts to test">
                  {#each liftsHere as n (n)}
                    {@const on = ticked.includes(n)}
                    <button type="button" aria-pressed={on} onclick={() => (lifts = on ? ticked.filter((x) => x !== n) : [...ticked, n])}
                      class="h-8 rounded-full border px-3 text-xs transition-colors {on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">{n}</button>
                  {:else}
                    <span class="text-xs text-muted-foreground">No weighted lifts in week {from} yet. Add some to the days first.</span>
                  {/each}
                </div>
                <span class="text-xs text-muted-foreground">The rest of the day runs as normal.</span>
              {:else if choice === k.id && k.id === "progression"}
                <span class="flex gap-2"><Button variant="outline" size="sm" onclick={() => (picking = true)}>Change</Button>{#if rule}<Button variant="ghost" size="sm" onclick={() => (rule = undefined)}>Use the program's</Button>{/if}</span>
              {:else if choice === k.id && k.id === "week"}
                <OptionSelect size="sm" value={weekValue} aria-label="Kind of week" options={weekOptions} onValueChange={(v) => (weekValue = v)} />
                {#if weekValue === "new"}
                  <div class="flex flex-col gap-2.5">
                    <label class="flex flex-col gap-1 text-xs font-medium">Its name<Input bind:value={own.name} placeholder="Peak" maxlength={30} /></label>
                    <div class="grid grid-cols-3 gap-2">
                      <label class="flex flex-col gap-1 text-xs font-medium">Sets (±)<Input type="number" value={String(own.setsDelta ?? 0)} oninput={(e) => (own.setsDelta = num(e.currentTarget.value))} /></label>
                      <label class="flex flex-col gap-1 text-xs font-medium">Load (± %)<Input type="number" value={String(own.loadPct ?? 0)} oninput={(e) => (own.loadPct = num(e.currentTarget.value))} /></label>
                      <label class="flex flex-col gap-1 text-xs font-medium">Reps (±)<Input type="number" value={String(own.repsDelta ?? 0)} oninput={(e) => (own.repsDelta = num(e.currentTarget.value))} /></label>
                    </div>
                    <label class="flex items-center gap-3 text-[13px]"><Switch checked={!!own.lastSetAmrap} onCheckedChange={(v) => (own.lastSetAmrap = v)} />Last set as many as you can</label>
                    <label class="flex items-center gap-3 text-[13px]"><Switch checked={own.progression === "pauses"} onCheckedChange={(v) => (own.progression = v ? "pauses" : "moves")} />The progression pauses</label>
                  </div>
                {/if}
                {@const w = what()}
                {#if w?.kind === "week"}<span class="text-xs text-muted-foreground">{weekTypeText(w.type)}</span>{/if}
              {/if}
            </div>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">Clients see its name on their Home: "Week {from} of {total} · {name.trim() || placeholder}".</p>
      </div>

<RulePickerDialog bind:open={picking} current={rule ?? null} exercise={null} onpick={(r) => (rule = r ?? undefined)} />
