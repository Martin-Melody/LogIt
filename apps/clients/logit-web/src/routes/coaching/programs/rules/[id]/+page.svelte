<!-- Programs › Rules › New rule / Edit (canvas Q2): the same no-code rule builder lifters have
     on the phone (Settings › Progression › Build), saved as you go. "What it would do" previews
     it on a client's lift; "In words" is what clients see under "Why this weight?". -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import OptionSelect from "$lib/components/option-select.svelte";
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import { createProgressionRecipe, normalizeRecipe, recipeShareCode, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
  import { estimatesFrom, loadFor } from "@logit/core/domain/programPlan";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { getWebCoachProgramRepo, getWebDeps } from "$lib/deps";
  import { inView } from "$lib/features/coaching/coachingData";
  import { ownRule, rules } from "$lib/features/coaching/programs/rules.svelte";

  const id = $derived(page.params.id!);
  let r = $state<ProgressionRecipe | null>(null);
  let status = $state<"saved" | "saving" | "error">("saved");
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    await rules.load();
    if (id === "new") {
      const fresh = createProgressionRecipe("New progression");
      r = fresh;
      await save(fresh);
      await goto(`/coaching/programs/rules/${fresh.id}`, { replaceState: true });
    } else r = rules.list.find((x) => x.id === id) ?? null;
    void loadClients();
  });

  function set<K extends keyof ProgressionRecipe>(key: K, value: ProgressionRecipe[K]) {
    if (!r) return;
    r = normalizeRecipe({ ...$state.snapshot(r), [key]: value } as ProgressionRecipe);
    status = "saving";
    clearTimeout(timer);
    timer = setTimeout(() => void save($state.snapshot(r) as ProgressionRecipe), 600);
  }

  /** Save the rule, and bring your programs that use it up to date (their copy of its blocks). */
  async function save(next: ProgressionRecipe) {
    try {
      await rules.save(next);
      const repo = getWebCoachProgramRepo();
      const mine = (await repo.listMyPrograms({ templates: true })).map((m) => m.program);
      const rule = ownRule(next);
      for (const p of mine) {
        const touches = (x: CoachProgram["rule"]) => x?.kind === "own" && x.ruleId === next.id;
        if (!touches(p.rule) && !p.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => b.type === "strength" && touches(b.rule))))) continue;
        await repo.saveProgram({
          ...p,
          ...(touches(p.rule) ? { rule } : {}),
          weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" && touches(b.rule) ? { ...b, rule } : b)) })) })),
          updatedAtMs: Date.now(),
        });
      }
      status = "saved";
    } catch {
      status = "error";
    }
  }

  // ── What it would do ──
  let clients = $state<ClientRelationship[]>([]);
  let who = $state("");
  let lift = $state("");
  let estimates = $state<Map<string, number>>(new Map());
  async function loadClients() {
    clients = inView(await coachApi.listClients().catch(() => []));
    who = clients[0]?.client.id ?? "";
  }
  $effect(() => {
    if (!who) return;
    void getWebDeps(who).workoutRepo.listAllSessions().then((s) => {
      estimates = estimatesFrom(s);
      lift = [...estimates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }, () => (estimates = new Map()));
  });
  const est = $derived(lift ? estimates.get(lift) ?? null : null);
  const range = $derived<[number, number]>(r?.repRange ?? [5, 8]);
  const step = (kg: number) => Math.round(Math.round(kg / (r?.increment || 2.5)) * (r?.increment || 2.5) * 100) / 100;

  /** Next session, if they get the top of the range, and after two stalls. */
  const preview = $derived.by(() => {
    if (!r || !est) return null;
    const sets = r.sets.mode === "fixed" ? r.sets.count : 3;
    const day = (e: number) => {
      if (r!.weightFrom === "wave") {
        const tm = e * 0.9;
        return [0.65, 0.75, 0.85].map((p) => `${step(tm * p)} × 5`).join(" · ");
      }
      const top = range[1];
      const w = r!.weightFrom === "estimate" ? loadFor(e, top, r!.repsInReserve) : step(e / (1 + range[0] / 30));
      const reps = r!.weightFrom === "estimate" ? top : range[0];
      if (r!.setLayout === "topBackoff") return [`${w} × ${reps} top`, ...Array.from({ length: sets - 1 }, () => `${step(w * 0.9)} × ${range[1]}`)].join(" · ");
      if (r!.setLayout === "dropWeight") return Array.from({ length: sets }, (_, i) => `${step(w * (1 - 0.05 * i))} × ${reps}`).join(" · ");
      return Array.from({ length: sets }, () => `${w} × ${reps}`).join(" · ");
    };
    return {
      next: day(est),
      got: day(est * 1.03),
      stalled: day(r.whenStalled === "deload" ? est * 0.9 : est),
    };
  });

  const words = $derived.by(() => {
    if (!r) return "";
    const rr = r.repRange ? `${r.repRange[0]}–${r.repRange[1]} reps` : "5–8 reps for big lifts and 8–12 for the rest";
    const sets = r.sets.mode === "fixed" ? `${r.sets.count} working sets` : "working sets from their weekly sets per muscle";
    const layout = r.setLayout === "topBackoff" ? `one top set then back-offs 10% lighter` : r.setLayout === "dropWeight" ? "the weight coming down a little each set" : "the same weight every set";
    const from = r.weightFrom === "estimate" ? `Weight from their strength estimate, ${r.repsInReserve === 0 ? "close to failure" : `${r.repsInReserve} ${r.repsInReserve === 1 ? "rep" : "reps"} left`}` : r.weightFrom === "last" ? "Weight from last session: fill the range, then add a step" : "A 4-week wave on a training max";
    const stall = r.whenStalled === "deload" ? "10% off after two stalls" : "the weight held when they stall";
    const food = r.food === "diary" ? " Holds the weight in a calorie deficit." : "";
    return `${from}, ${rr}, ${layout}, ${sets}. ${r.increment} kg steps, ${stall}.${food}`;
  });

  const seg = (on: boolean) => `h-9 rounded-[8px] px-3 text-[13px] transition-colors ${on ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`;
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Programs", href: "/coaching/programs" }, { label: "Progressions", href: "/coaching/programs?tab=progressions" }, { label: r?.name ?? "Progression" }]} />
  {#if !r}
    <p class="text-[13px] text-muted-foreground">{rules.loaded ? "This progression doesn't exist any more." : "Loading…"}</p>
  {:else}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <label class="flex flex-[1_1_320px] flex-col gap-1.5 text-xs font-medium text-muted-foreground">Name
        <Input value={r.name} class="h-10 text-[17px] font-semibold text-foreground" onchange={(e) => set("name", e.currentTarget.value.trim() || r!.name)} />
      </label>
      <span class="flex items-center gap-2">
        <span class="text-xs {status === 'error' ? 'text-destructive' : 'text-muted-foreground'}" role="status">{status === "saving" ? "Saving…" : status === "error" ? "Couldn't save" : "Saved · the same builder lifters have on the phone"}</span>
        <Button variant="outline" size="sm" onclick={() => void navigator.clipboard.writeText(recipeShareCode(r!)).then(() => toast.success("Copied. Paste it in Settings › Progression on the phone."))}>Copy share code</Button>
      </span>
    </header>

    <div class="flex flex-wrap items-start gap-4">
      <section class="flex min-w-0 flex-[2_1_480px] flex-col divide-y divide-border rounded-[12px] border border-border bg-card">
        <div class="flex flex-col gap-2 px-5 py-4">
          <Label>Weight comes from</Label>
          <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="Weight comes from">
            {#each [["estimate", "Strength estimate"], ["last", "Last session"], ["wave", "4-week wave"]] as [v, l] (v)}
              <button type="button" role="radio" aria-checked={r.weightFrom === v} class={seg(r.weightFrom === v)} onclick={() => set("weightFrom", v as ProgressionRecipe["weightFrom"])}>{l}</button>
            {/each}
          </div>
          <p class="text-xs text-muted-foreground">{r.weightFrom === "estimate" ? "Every set from their estimated best, like LogIt Adaptive." : r.weightFrom === "last" ? "Fill the rep range, then add a step, like Linear Progression." : "5s, 3s, 5/3/1, then a light week, off a training max."}</p>
        </div>
        {#if r.weightFrom !== "wave"}
          <div class="flex flex-wrap items-end gap-3 px-5 py-4">
            <div class="flex flex-col gap-1.5"><Label for="rr-lo">Rep range</Label>
              <span class="flex items-center gap-2 text-[13px]">
                <Input id="rr-lo" class="w-16" inputmode="numeric" value={r.repRange?.[0] ?? ""} placeholder="5" onchange={(e) => { const a = Number(e.currentTarget.value); const b = r!.repRange?.[1] ?? Math.max(a, 8); set("repRange", a > 0 ? [a, Math.max(a, b)] as [number, number] : undefined); }} />
                to
                <Input class="w-16" aria-label="Rep range top" inputmode="numeric" value={r.repRange?.[1] ?? ""} placeholder="8" onchange={(e) => { const b = Number(e.currentTarget.value); const a = r!.repRange?.[0] ?? Math.min(b, 5); set("repRange", b > 0 ? [Math.min(a, b), b] as [number, number] : undefined); }} />
              </span>
            </div>
            <p class="pb-2 text-xs text-muted-foreground">Empty: 5–8 for big lifts, 8–12 for the rest.</p>
          </div>
        {/if}
        {#if r.weightFrom === "estimate"}
          <div class="flex flex-col gap-2 px-5 py-4">
            <Label>Reps left in the tank</Label>
            <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="Reps left in the tank">
              {#each [0, 1, 2, 3] as n (n)}<button type="button" role="radio" aria-checked={r.repsInReserve === n} class={seg(r.repsInReserve === n)} onclick={() => set("repsInReserve", n)}>{n}</button>{/each}
            </div>
          </div>
          <div class="flex flex-col gap-2 px-5 py-4">
            <Label>Set layout</Label>
            <div class="inline-flex w-fit flex-wrap gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="Set layout">
              {#each [["straight", "Same weight every set"], ["topBackoff", "Top set + back-offs"], ["dropWeight", "Weight drops each set"]] as [v, l] (v)}
                <button type="button" role="radio" aria-checked={r.setLayout === v} class={seg(r.setLayout === v)} onclick={() => set("setLayout", v as ProgressionRecipe["setLayout"])}>{l}</button>
              {/each}
            </div>
          </div>
        {/if}
        <div class="flex flex-wrap gap-6 px-5 py-4">
          <div class="flex flex-col gap-1.5"><Label for="inc">Smallest step (kg)</Label><Input id="inc" class="w-24" inputmode="decimal" value={r.increment} onchange={(e) => set("increment", Number(e.currentTarget.value.replace(",", ".")))} /><span class="text-xs text-muted-foreground">A machine's own steps win.</span></div>
          <div class="flex flex-col gap-1.5"><Label>When they stall</Label>
            <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="When they stall">
              <button type="button" role="radio" aria-checked={r.whenStalled === "deload"} class={seg(r.whenStalled === "deload")} onclick={() => set("whenStalled", "deload")}>Take 10% off</button>
              <button type="button" role="radio" aria-checked={r.whenStalled === "hold"} class={seg(r.whenStalled === "hold")} onclick={() => set("whenStalled", "hold")}>Hold the weight</button>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-end gap-6 px-5 py-4">
          <div class="flex flex-col gap-1.5"><Label>Working sets</Label>
            <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="Working sets">
              <button type="button" role="radio" aria-checked={r.sets.mode === "fixed"} class={seg(r.sets.mode === "fixed")} onclick={() => set("sets", { ...r!.sets, mode: "fixed" })}>Fixed</button>
              <button type="button" role="radio" aria-checked={r.sets.mode === "weekly"} class={seg(r.sets.mode === "weekly")} onclick={() => set("sets", { ...r!.sets, mode: "weekly" })}>From weekly sets per muscle</button>
            </div>
          </div>
          {#if r.sets.mode === "fixed"}<Input class="w-16" aria-label="How many working sets" inputmode="numeric" value={r.sets.count} onchange={(e) => set("sets", { ...r!.sets, count: Number(e.currentTarget.value) })} />{/if}
          <div class="flex flex-col gap-1.5"><Label>Food</Label>
            <div class="inline-flex w-fit gap-0.5 rounded-[10px] bg-muted p-[3px]" role="radiogroup" aria-label="Food">
              <button type="button" role="radio" aria-checked={r.food === "ignore"} class={seg(r.food === "ignore")} onclick={() => set("food", "ignore")}>Ignore</button>
              <button type="button" role="radio" aria-checked={r.food === "diary"} class={seg(r.food === "diary")} onclick={() => set("food", "diary")}>Hold the weight in a deficit</button>
            </div>
            {#if r.food === "diary"}<span class="text-xs text-muted-foreground">Needs their food diary shared.</span>{/if}
          </div>
        </div>
      </section>

      <aside class="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-[12px] border border-border bg-card px-5 py-4">
        <h2 class="text-sm font-semibold">What it would do</h2>
        {#if clients.length}
          <div class="flex flex-wrap gap-2">
            <OptionSelect size="sm" bind:value={who} aria-label="Preview with" class="w-40" options={clients.map((c) => ({ value: c.client.id, label: c.client.displayName || c.client.username }))} />
            <OptionSelect size="sm" bind:value={lift} aria-label="Lift" class="w-48" options={[...estimates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ value: k, label: `${k.replace(/\b\w/g, (c) => c.toUpperCase())} · ${Math.round(v)} kg` }))} />
          </div>
        {/if}
        {#if preview}
          <dl class="flex flex-col gap-2 text-[13px]">
            <div><dt class="text-xs text-muted-foreground">Next</dt><dd class="text-info">{preview.next}</dd></div>
            <div><dt class="text-xs text-muted-foreground">If they get the top of the range</dt><dd>{preview.got}</dd></div>
            <div><dt class="text-xs text-muted-foreground">If they stall twice</dt><dd>{preview.stalled}</dd></div>
          </dl>
        {:else}
          <p class="text-[13px] text-muted-foreground">{clients.length ? "Pick a client who logs this lift to see the numbers." : "With a client, this shows the numbers it would give them."}</p>
        {/if}
        <div class="rounded-[10px] bg-muted px-3.5 py-3 text-[13px]"><b class="font-semibold">In words</b><br />{words}</div>
        <p class="text-xs text-muted-foreground">The sentence is what clients see under "Why this weight?" in the app. Programs of yours that use this progression follow your changes; clients' copies follow when you update them.</p>
      </aside>
    </div>
  {/if}
</div>
