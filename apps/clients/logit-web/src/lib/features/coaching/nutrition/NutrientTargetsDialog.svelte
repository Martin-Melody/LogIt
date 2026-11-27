<!-- Canvas NT1: "Choose targets" — targets beyond calories and protein. Unticked: they keep their
     own target or none. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import OptionSelect from "$lib/components/option-select.svelte";
  import type { NutrientTarget } from "@logit/core/domain/CoachNutritionPlan";
  import { NUTRIENTS, type NutrientId } from "@logit/core/domain/nutrients";

  let { open = $bindable(false), targets, onchange }: { open?: boolean; targets: NutrientTarget[]; onchange: (next: NutrientTarget[]) => void } = $props();
  let more = $state(false);
  const label = NUTRIENTS.filter((n) => n.group === "label");
  const micro = NUTRIENTS.filter((n) => n.group !== "label");
  const targetOf = (id: NutrientId) => targets.find((x) => x.id === id) ?? null;
  const set = (id: NutrientId, t: NutrientTarget | null) => onchange([...targets.filter((x) => x.id !== id), ...(t ? [t] : [])]);
</script>

{#snippet row(n: (typeof NUTRIENTS)[number])}
  {@const t = targetOf(n.id)}
  <div class="grid grid-cols-[1fr_7rem_6rem] items-center gap-2 border-t border-border py-1.5 text-[13px]">
    <label class="flex items-center gap-2"><Switch checked={!!t} aria-label="Set a target for {n.name}" onCheckedChange={(v) => set(n.id, v ? { id: n.id, kind: n.kind === "max" ? "atMost" : "atLeast", amount: n.daily ?? 1 } : null)} />{n.name}</label>
    {#if t}
      <OptionSelect size="sm" value={t.kind} aria-label="{n.name}: at least, at most or about" options={[{ value: "atLeast", label: "At least" }, { value: "atMost", label: "At most" }, { value: "about", label: "About" }]} onValueChange={(v) => set(n.id, { ...t, kind: v as NutrientTarget["kind"] })} />
      <span class="flex items-center gap-1"><input class="h-8 w-16 rounded-[7px] border border-input bg-background px-2" inputmode="decimal" aria-label="{n.name} amount" value={t.amount} onchange={(e) => { const v = Number(e.currentTarget.value.replace(",", ".")); if (v > 0) set(n.id, { ...t, amount: v }); }} /><span class="text-xs text-muted-foreground">{n.unit}</span></span>
    {:else}
      <span class="col-span-2 text-xs text-muted-foreground">Their own, or none</span>
    {/if}
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>More targets</Dialog.Title>
      <Dialog.Description>Unticked, they keep their own target or none. The same every day of the plan.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col">
      {#each label as n (n.id)}{@render row(n)}{/each}
      {#if more}{#each micro as n (n.id)}{@render row(n)}{/each}{/if}
      <Button variant="outline" size="sm" class="mt-2 self-start" onclick={() => (more = !more)}>{more ? "Fewer" : `Vitamins and minerals (${micro.length})`}</Button>
    </div>
    <p class="text-xs text-muted-foreground">Many foods don't list vitamins, so a vitamin target is only as good as the labels; their diary says when a day's number is incomplete.</p>
    <Dialog.Footer><Button onclick={() => (open = false)}>Done</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
