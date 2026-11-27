<!-- Programs › Rules (canvas PG10): how weights move up (your rules, and community ones your
     programs use) and what clients can swap to. New rule and Edit open the rule builder. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import SwapDefaultCard from "$lib/features/coaching/SwapDefaultCard.svelte";
  import type { ClientRelationship } from "@logit/core/api/coachApi";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { describeRecipe, recipeShareCode, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
  import type { SwapRule } from "@logit/core/domain/swaps";
  import { rules } from "./rules.svelte";

  let { programs, clients, swapRule = $bindable("any") }: { programs: CoachProgram[]; clients: ClientRelationship[]; swapRule?: SwapRule } = $props();

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
    {#if !rules.list.length && !pluginRules.length}
      <p class="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">LogIt Adaptive, Linear, the 4-week wave and Fixed are built in. Make your own when none of them fits.</p>
    {/if}
    <div class="border-t border-border px-5 py-3"><Button variant="ghost" size="sm" href="/plugins">Browse community rules</Button></div>
  </section>

  <SwapDefaultCard bind:rule={swapRule} {clients} />
  <p class="text-xs text-muted-foreground">A client's own swap rule is on their page, under Programs.</p>
</div>
