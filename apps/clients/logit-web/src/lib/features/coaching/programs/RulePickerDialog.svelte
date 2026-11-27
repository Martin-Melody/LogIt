<!-- One rule picker (canvas PG4): how an exercise's weight moves up, for the whole program or
     one exercise. Built in, your own (Programs › Progressions), and ones from your plugins. The
     same picker will choose meal plans' training-day targets in Nutrition. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { describeRecipe } from "@logit/core/domain/progressionRecipe";
  import type { ProgramRule } from "@logit/core/domain/CoachProgram";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import { ownRule, rules } from "./rules.svelte";

  let { open = $bindable(false), current, exercise = null, onpick }: {
    open?: boolean;
    /** The rule now, to start from. Null on an exercise: the program's. */
    current: ProgramRule | null;
    /** Picking for one exercise (and maybe the program): its name. */
    exercise?: string | null;
    /** `program`: use it for every exercise; otherwise just this one (null = the program's). */
    onpick: (rule: ProgramRule | null, scope: "exercise" | "program") => void;
  } = $props();

  const BUILT_IN: { rule: ProgramRule; title: string; text: string }[] = [
    { rule: { kind: "adaptive" }, title: "LogIt Adaptive", text: "Weight from their strength estimate, aiming for 2 reps left. When they get the top of the range on every set, the weight goes up." },
    { rule: { kind: "linear", stepKg: 2.5 }, title: "Linear Progression", text: "Fill the rep range, then add a step. Holds or drops 10% when they stall." },
    { rule: { kind: "wave" }, title: "4-week wave", text: "Percentages of a training max: 5s, 3s, a top week, a light week." },
    { rule: { kind: "fixed" }, title: "Same every time (Fixed)", text: "Nothing moves on its own. You type each week in See every week." },
  ];

  let picked = $state<ProgramRule | null>(null);
  let scope = $state<"exercise" | "program">("exercise");
  $effect(() => {
    if (!open) return;
    picked = current;
    scope = "exercise";
    void rules.load();
    void plugins.loadInstalls().catch(() => {});
  });

  const same = (a: ProgramRule | null, b: ProgramRule | null) =>
    !!a && !!b && a.kind === b.kind && (a.kind !== "own" || (b.kind === "own" && a.ruleId === b.ruleId)) && (a.kind !== "plugin" || (b.kind === "plugin" && a.pluginId === b.pluginId));
  const pluginRules = $derived(plugins.installed.filter((p) => p.manifest.family === "progression-algorithm"));
  const label = (r: ProgramRule | null) => !r ? "the program's" : r.kind === "adaptive" ? "LogIt Adaptive" : r.kind === "linear" ? "Linear Progression" : r.kind === "wave" ? "4-week wave" : r.kind === "fixed" ? "Fixed" : r.name;

  function choose(r: ProgramRule | null) { picked = r; }
  function use() {
    onpick(picked, exercise ? scope : "program");
    open = false;
  }
</script>

    {#snippet option(r: ProgramRule | null, title: string, text: string, tag?: string)}
  <button type="button" role="radio" aria-checked={same(picked, r) || (!r && !picked)} onclick={() => choose(r)}
    class="flex w-full flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors {same(picked, r) || (!r && !picked) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}">
    <span class="flex items-center gap-2 text-sm font-semibold">{title}{#if tag}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{tag}</span>{/if}</span>
    <span class="text-xs leading-relaxed text-muted-foreground">{text}</span>
  </button>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{exercise ? `How ${exercise} moves up` : "How the weights move up"}</Dialog.Title>
      {#if exercise}
        <div class="flex items-center gap-1 pt-1 text-[13px]" role="radiogroup" aria-label="Apply to">
          <span class="text-muted-foreground">Apply to:</span>
          <button type="button" role="radio" aria-checked={scope === "exercise"} onclick={() => (scope = "exercise")} class="rounded-full px-2.5 py-1 {scope === 'exercise' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}">this exercise</button>
          <span class="text-muted-foreground">or</span>
          <button type="button" role="radio" aria-checked={scope === "program"} onclick={() => (scope = "program")} class="rounded-full px-2.5 py-1 {scope === 'program' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}">the whole program</button>
        </div>
      {/if}
    </Dialog.Header>



    <div class="flex flex-col gap-4" role="radiogroup" aria-label="Progression">
      {#if exercise && scope === "exercise"}
        {@render option(null, "The program's progression", "Follow whatever the program uses.")}
      {/if}
      <section class="flex flex-col gap-1.5">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Built in</h3>
        {#each BUILT_IN as b (b.title)}{@render option(b.rule, b.title, b.text)}{/each}
      </section>
      <section class="flex flex-col gap-1.5">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your progressions</h3>
        {#each rules.list as r (r.id)}{@render option(ownRule(r), r.name, describeRecipe(r), "Yours")}
        {:else}<p class="text-xs text-muted-foreground">None yet. Make one in Programs › Progressions.</p>{/each}
      </section>
      <section class="flex flex-col gap-1.5">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">From your plugins</h3>
        {#each pluginRules as p (p.manifest.id)}{@render option({ kind: "plugin", pluginId: p.manifest.id, name: p.manifest.name }, p.manifest.name, `${p.manifest.description} Runs on their phone; they're asked to allow it.`, "Community")}
        {:else}<p class="text-xs text-muted-foreground">No progression plugins installed.</p>{/each}
        <Button variant="outline" size="sm" class="self-start" href="/plugins?family=progression-algorithm">Browse community progressions</Button>
      </section>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={use}>Use {label(picked)}{exercise && scope === "program" ? " for every exercise" : ""}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
