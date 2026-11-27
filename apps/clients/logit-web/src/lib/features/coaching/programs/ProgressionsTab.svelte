<!-- Programs › Progressions (canvas PB10): how weights move up. LogIt's built-in ones, yours (New
     progression and Edit open the builder) and community ones your programs use, with what each
     does in a lighter week. Swaps have their own tab (SwapsTab). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { describeRecipe, recipeShareCode, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
  import { rules } from "./rules.svelte";

  let { programs }: { programs: CoachProgram[] } = $props();

  // LogIt's own, always there. "In a lighter week": what they do in the program's lighter weeks.
  const BUILT_IN = [
    { kind: "adaptive", name: "LogIt Adaptive", text: "Weights from each client's strength estimate, aiming for 2 reps left; up when they hit the top of the range on every set.", light: "Half the sets, last week's weight; carries on after" },
    { kind: "linear", name: "Linear Progression", text: "Fill the rep range, then add a step. Holds or drops 10% when they stall.", light: "Half the sets, same weight; carries on after" },
    { kind: "wave", name: "4-week wave", text: "Percentages of a training max: 5s, 3s, a top week, a light week.", light: "Plans its own light week" },
    { kind: "fixed", name: "Fixed", text: "Nothing moves on its own: you type every week's numbers.", light: "Half the sets of what you typed" },
  ] as const;

  onMount(() => void rules.load());

  /** Programs (yours, not archived) that use a rule, for the program or any exercise. */
  const uses = (match: (r: CoachProgram["rule"]) => boolean) =>
    programs.filter((p) => !p.archived && (match(p.rule) || p.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => b.type === "strength" && match(b.rule))))));
  const usesRecipe = (r: ProgressionRecipe) => uses((x) => x?.kind === "own" && x.ruleId === r.id).length;
  const pluginRules = $derived.by(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const p of programs) {
      if (p.archived) continue;
      const found = [p.rule, ...p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => (b.type === "strength" ? b.rule : undefined))))];
      for (const r of found) if (r?.kind === "plugin") m.set(r.pluginId, { name: r.name, count: (m.get(r.pluginId)?.count ?? 0) + 1 });
    }
    return [...m.entries()];
  });

  const actions = (r: ProgressionRecipe): RowAction[] => [
    { id: "edit", label: "Edit", run: () => void goto(`/coaching/programs/rules/${r.id}`) },
    { id: "share", label: "Copy its share code", run: () => void navigator.clipboard.writeText(recipeShareCode(r)).then(() => toast.success("Copied. Lifters paste it in Settings › Progression on the phone.")) },
    {
      id: "delete", label: "Delete", danger: true, separatorBefore: true,
      disabled: usesRecipe(r) ? "Programs use it" : undefined,
      run: () => void rules.remove(r).then(() => toast.success(`${r.name} deleted`)),
    },
  ];
</script>

<div class="flex flex-col gap-4">
  <section class="flex flex-col rounded-[12px] border border-border bg-card" aria-labelledby="rules-h">
    <h2 id="rules-h" class="px-5 pb-2 pt-4 text-sm font-semibold">How weights move up</h2>
    {#each BUILT_IN as b (b.kind)}
      {@const n = uses((x) => (x?.kind ?? "adaptive") === b.kind).length}
      <article class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3.5">
        <span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span class="flex items-center gap-2 text-[15px] font-semibold">{b.name}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">LogIt</span></span>
          <span class="text-[13px] text-muted-foreground">{b.text}</span>
        </span>
        <span class="flex flex-[0_1_220px] flex-col text-[13px]"><span class="text-xs text-muted-foreground">In a lighter week</span>{b.light}</span>
        <span class="text-[13px] {n ? '' : 'text-muted-foreground'}">{n ? `In ${n} ${n === 1 ? "program" : "programs"}` : "Not used yet"}</span>
      </article>
    {/each}
    {#each rules.list as r (r.id)}
      {@const n = usesRecipe(r)}
      <ActionMenu actions={actions(r)} label="More for {r.name}">
        {#snippet children({ props, more })}
          <article {...props} class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3.5 data-[state=open]:bg-muted/40">
            <a href="/coaching/programs/rules/{r.id}" class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
              <span class="flex items-center gap-2 text-[15px] font-semibold">{r.name}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Yours</span></span>
              <span class="text-[13px] text-muted-foreground">{describeRecipe(r)}</span>
            </a>
            <span class="text-[13px] {n ? '' : 'text-muted-foreground'}">{n ? `In ${n} ${n === 1 ? "program" : "programs"}` : "Not used yet"}</span>
            <Button variant="outline" size="sm" href="/coaching/programs/rules/{r.id}">Edit</Button>
            {@render more()}
          </article>
        {/snippet}
      </ActionMenu>
    {/each}
    {#each pluginRules as [id, p] (id)}
      <article class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3.5">
        <span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span class="flex items-center gap-2 text-[15px] font-semibold">{p.name}<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Community plugin</span></span>
          <span class="text-[13px] text-muted-foreground">Runs on clients' phones; they're asked to allow it.</span>
        </span>
        <span class="text-[13px]">In {p.count} {p.count === 1 ? "program" : "programs"}</span>
        <Button variant="outline" size="sm" href="/plugins/{encodeURIComponent(id)}">Open</Button>
      </article>
    {/each}
    <div class="flex flex-wrap gap-2 border-t border-border px-5 py-3">
      <Button variant="outline" size="sm" href="/coaching/programs/rules/new">Make your own</Button>
      <Button variant="ghost" size="sm" href="/plugins?family=progression-algorithm">Browse community progressions</Button>
    </div>
  </section>
</div>
