<!-- Canvas MP5 (and FX1's meal-plan half): give a meal plan to clients. Each gets their own copy;
     for each, what it works out to (Adaptive targets from their weight and diary), which days are
     training days, a check against their start-up answers and their resting burn, and when it
     replaces the plan they have (from tomorrow, today, or from when the wrong one started). -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import XIcon from "@lucide/svelte/icons/x";
  import { getWebCoachNutritionPlanRepo } from "$lib/deps";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import { planFromIso, withPlanFallback, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
  import { copyPlanForClient, planClashes, replacePlan, restingBurn, type ReplaceFrom } from "@logit/core/domain/givingMealPlan";
  import { DIET_TAG_LABELS, localDateIso } from "@logit/core/domain/nutrition";
  import { clientNutritionContext, targetsLine, type ClientNutritionContext } from "./clientNutrition";
  import { inView } from "../coachingData";

  let { open = $bindable(false), plan = null, clientIds = [], ongiven }: {
    open?: boolean;
    /** The plan to give; null: pick one of yours. */
    plan?: CoachNutritionPlan | null;
    clientIds?: string[];
    ongiven?: () => void;
  } = $props();

  let clients = $state<ClientRelationship[]>([]);
  let library = $state<CoachNutritionPlan[]>([]);
  let pick = $state("");
  let chosen = $state<string[]>([]);
  let ctx = $state<Record<string, (ClientNutritionContext & { line: string; low: string | null }) | "loading">>({});
  let from = $state<Record<string, ReplaceFrom>>({});
  let note = $state<Record<string, string>>({});
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    chosen = [...clientIds];
    ctx = {};
    from = {};
    note = {};
    void Promise.all([coachApi.listClients(), getWebCoachNutritionPlanRepo().listMine({ templates: true })]).then(([c, rows]) => {
      clients = inView(c);
      library = rows.map((r) => r.plan).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
      pick = plan?.id ?? library[0]?.id ?? "";
    }, () => {});
  });
  const giving = $derived(plan ?? library.find((p) => p.id === pick) ?? null);
  const people = $derived(chosen.map((id) => clients.find((c) => c.client.id === id)).filter((c): c is ClientRelationship => !!c));
  const others = $derived(clients.filter((c) => !chosen.includes(c.client.id)));
  const nameOf = (c: ClientRelationship) => c.client.displayName || c.client.username;
  const first = (c: ClientRelationship) => nameOf(c).split(" ")[0]!;
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Each client's preview, worked out once per plan.
  $effect(() => {
    const p = giving;
    if (!p || !open) return;
    for (const c of people) {
      const key = `${p.id}:${c.client.id}`;
      if (ctx[key]) continue;
      ctx = { ...ctx, [key]: "loading" };
      void (async () => {
        const s = c.sharing ?? { workouts: true, nutrition: true, bodyweight: true, habits: true, checkins: true };
        const base = await clientNutritionContext(c.client.id, s);
        const t = await targetsLine(c.client.id, p).catch(() => ({ text: "", days: [], proteinG: null }));
        const burn = restingBurn(base.goal, base.weightKg);
        const lowDay = burn ? t.days.find((d) => d.kcal > 0 && d.kcal < burn) : null;
        ctx = { ...ctx, [key]: { ...base, line: t.text, low: lowDay && burn ? `${lowDay.name === "Every day" ? "It comes" : `${lowDay.name}s come`} out at ${lowDay.kcal.toLocaleString("en-GB")} kcal, below ${first(c)}'s resting burn (about ${burn.toLocaleString("en-GB")} kcal).` : burn ? `About ${burn.toLocaleString("en-GB")} kcal is ${first(c)}'s resting burn; every day of this plan is above it.` : null } };
      })();
    }
  });

  function trainingDaysText(c: ClientRelationship, x: ClientNutritionContext): string | null {
    if (!giving || giving.mode !== "training-rest") return null;
    const prog = x.program?.program;
    const week = prog?.weeks.find((w) => w.weekNumber === (x.program?.week ?? 1)) ?? prog?.weeks[0];
    const days = [...new Set((week?.days ?? []).map((d) => d.weekday).filter((w): w is number => w != null))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return prog && days.length ? `Training days are ${first(c)}'s ${prog.name} days: ${days.map((d) => WEEKDAY[d]).join(", ")}, and any day ${first(c)} trains.` : `Training days are any day ${first(c)} trains.`;
  }

  async function give() {
    if (!giving || busy || !people.length) return;
    busy = true;
    const repo = getWebCoachNutritionPlanRepo();
    const today = localDateIso();
    try {
      for (const c of people) {
        const x = ctx[`${giving.id}:${c.client.id}`];
        const current = x && x !== "loading" ? x.current : null;
        const choice = from[c.client.id] ?? "tomorrow";
        const { ended, plan: copy } = replacePlan(current, withPlanFallback(copyPlanForClient(giving, today)), current ? choice : "today", today);
        if (ended) await repo.savePlan(ended, c.client.username);
        await repo.savePlan(copy, c.client.username);
        const msg = (note[c.client.id] ?? "").trim();
        if (msg) await messagesApi.send({ relationshipId: c.relationshipId, messageId: createId("msg"), createdAtMs: Date.now(), body: msg }).catch(() => {});
      }
      toast.success(people.length === 1 ? `${giving.name} given to ${first(people[0]!)}` : `${giving.name} given to ${people.length} clients`);
      open = false;
      ongiven?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't give it");
    } finally {
      busy = false;
    }
  }
  const sinceText = (p: CoachNutritionPlan) => new Date(`${planFromIso(p)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-[560px]">
    <Dialog.Header>
      <Dialog.Title>{giving ? `Give "${giving.name}"` : "Give a meal plan"}{people.length === 1 ? ` to ${first(people[0]!)}` : ""}</Dialog.Title>
      <Dialog.Description>Each client gets their own copy; you can change theirs without touching this one.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      {#if !plan}
        <label class="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Meal plan
          <OptionSelect bind:value={pick} aria-label="Meal plan" options={library.map((p) => ({ value: p.id, label: p.name }))} />
        </label>
        {#if !library.length}<p class="text-[13px] text-muted-foreground">No meal plans yet. Make one in Nutrition › Meal plans.</p>{/if}
      {/if}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">To</span>
        <div class="flex flex-wrap items-center gap-1.5">
          {#each people as c (c.client.id)}
            <span class="inline-flex h-8 items-center gap-1 rounded-full bg-muted pl-3 pr-1 text-[13px]">{nameOf(c)}
              <button type="button" aria-label="Remove {nameOf(c)}" class="flex size-6 items-center justify-center rounded-full hover:bg-background" onclick={() => (chosen = chosen.filter((x) => x !== c.client.id))}><XIcon class="size-3.5" /></button>
            </span>
          {/each}
          {#if others.length}
            <OptionSelect value="" placeholder="Add a client…" aria-label="Add a client" class="h-8 w-44" options={others.map((c) => ({ value: c.client.id, label: nameOf(c) }))} onValueChange={(v) => { if (v) chosen = [...chosen, v]; }} />
          {/if}
        </div>
      </div>

      {#each people as c (c.client.id)}
        {@const x = giving ? ctx[`${giving.id}:${c.client.id}`] : undefined}
        <section class="flex flex-col gap-2.5 rounded-[10px] border border-border px-3.5 py-3 text-[13px]" aria-label="For {nameOf(c)}">
          {#if !x || x === "loading" || !giving}
            <p class="text-muted-foreground">Working it out for {first(c)}…</p>
          {:else}
            {@const clashes = planClashes(giving, x.avoid)}
            <div>
              <span class="text-xs font-medium text-muted-foreground">For {first(c)} it works out to</span>
              <p class="font-medium">{x.line || "Their targets"}{giving.kcalMode === "adaptive" ? (x.goal ? ` (Adaptive targets, from ${first(c)}'s weight and diary)` : ` (the plan's numbers until ${first(c)} sets a goal; then Adaptive targets aim at it)`) : ""}</p>
              {#if trainingDaysText(c, x)}<p class="text-xs text-muted-foreground">{trainingDaysText(c, x)}</p>{/if}
            </div>
            <div>
              <span class="text-xs font-medium text-muted-foreground">Checked against {first(c)}'s start-up answers</span>
              {#if !x.avoid.length}
                <p>{c.sharing?.checkins === false ? `${first(c)} doesn't share check-ins, so there's nothing to check.` : `${first(c)} didn't say there's food they don't eat.`}</p>
              {:else if !clashes.length}
                <p>{first(c)} doesn't eat: {x.avoid.map((t) => DIET_TAG_LABELS[t].toLowerCase()).join(", ")}. Nothing in the plan clashes.</p>
              {:else}
                {#each clashes as cl (cl.food.id + cl.tag)}
                  <p>{cl.swap ? `${cl.food.name} isn't ${DIET_TAG_LABELS[cl.tag].toLowerCase()}; ${first(c)} will only see its swap, ${cl.swap.name}.` : `${cl.food.name} isn't ${DIET_TAG_LABELS[cl.tag].toLowerCase()} and has no swap that is. Add one before giving it, or change it in ${first(c)}'s copy after.`}</p>
                {/each}
              {/if}
            </div>
            {#if x.low}
              <p class="rounded-[8px] px-2.5 py-2 {x.low.includes('below') ? 'bg-warning/10 text-foreground' : 'bg-muted text-muted-foreground'}">{x.low}{x.low.includes("below") ? " You can still give it." : ""}</p>
            {/if}
            {#if x.current}
              <div class="flex flex-col gap-1.5">
                <span>{first(c)} has "{x.current.name}" since {sinceText(x.current)}. This replaces it:</span>
                <OptionSelect value={from[c.client.id] ?? "tomorrow"} aria-label="When it replaces {x.current.name}"
                  options={[{ value: "tomorrow", label: "From tomorrow" }, { value: "today", label: "From today" }, { value: "wrong", label: `From ${sinceText(x.current)}: it was the wrong plan` }]}
                  onValueChange={(v) => (from = { ...from, [c.client.id]: v as ReplaceFrom })} />
                {#if from[c.client.id] === "wrong"}
                  <p class="text-xs text-muted-foreground">Since {sinceText(x.current)}, {first(c)}'s days are measured against the new targets instead, in their charts, your Nutrition tab and Adaptive targets. Food they logged and their weight entries stay exactly as they are.</p>
                {/if}
                <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Message to {first(c)} <span class="font-normal">optional</span>
                  <Textarea rows={2} value={note[c.client.id] ?? ""} placeholder={from[c.client.id] === "wrong" ? `Sorry ${first(c)}, I gave you the wrong plan. This is the right one; nothing you logged is lost.` : `Here's your new plan, ${first(c)}.`} oninput={(e) => (note = { ...note, [c.client.id]: e.currentTarget.value })} />
                </label>
              </div>
            {/if}
          {/if}
        </section>
      {/each}
      <p class="text-xs text-muted-foreground">They get one notification ("sent you a meal plan"). If they don't share their food diary, the plan still works; you just won't see how it's going.</p>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy || !giving || !people.length} onclick={() => void give()}>{busy ? "Giving…" : people.length === 1 ? `Give to ${first(people[0]!)}` : `Give to ${people.length} clients`}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
