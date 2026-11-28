<!-- Canvas W3: a program ending. How the block went, then the next one: run it again from
     their new numbers, copy it and change things, or something different. Reached from Today
     ("Plan next block"), the client's Training tab and Ctrl K. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as Table from "$lib/components/ui/table/index.js";
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import { toast } from "$lib/components/ui/sonner";
  import AssignProgramDialog from "$lib/features/coaching/programs/AssignProgramDialog.svelte";
  import { getWebCoachProgramRepo, getWebDeps, getWebNutritionDeps } from "$lib/deps";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import { loadCoachingOverview, currentProgram, parseSubmission, type ClientSummary, type ProgramStatus } from "$lib/features/coaching/coachingData";
  import { coachApi } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import { createId } from "@logit/core/domain/ids";
  import * as P from "@logit/core/domain/CoachProgram";
  import { blockSummaryText, nextBlockFrom, reviewBlock, type BlockReview, type LiftPoint } from "@logit/core/domain/nextBlock";
  import { activeLastingSwaps } from "@logit/core/domain/swaps";
  import { MUSCLE_LABELS } from "@logit/core/domain/weeklySets";
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import type { WorkoutSession } from "@logit/core/domain/workout";

  const clientId = $derived(page.params.id!);
  const DAY = 86_400_000;

  let client = $state<ClientSummary | null>(null);
  let status = $state<ProgramStatus | null>(null);
  let sessions = $state<WorkoutSession[]>([]);
  let index = $state<ExerciseIndex | null>(null);
  let weight = $state<{ start: number; now: number } | null>(null);
  let checkins = $state<{ sent: number; energy: number | null } | null>(null);
  let loaded = $state(false);
  let error = $state<string | null>(null);

  const program = $derived(status?.program ?? null);
  const first = $derived((client?.name ?? "them").split(" ")[0]!);
  const musclesOf = (name: string): MuscleGroup[] => index?.get(name)?.primaryMuscles ?? [];
  const review = $derived<BlockReview | null>(program ? reviewBlock(program, sessions, musclesOf) : null);
  const swaps = $derived(program ? activeLastingSwaps(program, sessions) : []);
  const endsMs = $derived.by(() => {
    const s = program ? P.getProgramStartMs(program) : null;
    return s != null && program ? s + program.weeks.length * 7 * DAY : null;
  });

  // The choices.
  let next = $state<"rerun" | "copy" | "different">("rerun");
  let moreSets = $state(true);
  let lighter = $state(false);
  let keepSwaps = $state(true);
  let startIso = $state<string | undefined>(undefined);
  let weeks = $state(8);
  let sendSummary = $state(true);
  let busy = $state(false);
  let assignOpen = $state(false);

  onMount(async () => {
    try {
      const o = await loadCoachingOverview();
      client = o.clients.find((c) => c.id === clientId) ?? null;
      if (!client) throw new Error("Not one of your clients.");
      const mine = await getWebCoachProgramRepo().listMyPrograms({ recipientId: clientId });
      status = currentProgram(mine.map((m) => m.program));
      const p = status?.program;
      if (p) {
        weeks = p.weeks.length;
        // Starts the Monday after it ends (or next Monday if it's already over).
        const end = (P.getProgramStartMs(p) ?? Date.now()) + p.weeks.length * 7 * DAY;
        const from = new Date(Math.max(end, Date.now()));
        from.setDate(from.getDate() + ((8 - from.getDay()) % 7 || 7));
        startIso = P.toDateInputValue(from.getTime());
      }
      const [all, idx] = await Promise.all([
        client.sharing.workouts ? getWebDeps(clientId).workoutRepo.listAllSessions().catch(() => []) : Promise.resolve([]),
        loadExerciseIndex([]).catch(() => null),
      ]);
      sessions = all;
      index = idx;
      const start = p ? P.getProgramStartMs(p) : null;
      if (start != null && client.sharing.bodyweight) {
        const entries = await getWebNutritionDeps(clientId).nutritionRepo.listWeightEntries(P.toDateInputValue(start - 7 * DAY)).catch(() => []);
        const avg = (from: number, to: number) => {
          const xs = entries.filter((e) => !e.deletedAtMs).filter((e) => { const t = Date.parse(e.dateIso); return t >= from && t < to; }).map((e) => e.weightKg);
          return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
        };
        const a = avg(start - 3 * DAY, start + 4 * DAY), b = avg(Date.now() - 7 * DAY, Date.now() + DAY);
        if (a != null && b != null) weight = { start: a, now: b };
      }
      if (start != null && client.sharing.checkins) {
        const items = (await coachApi.checkinInbox(365).catch(() => [])).filter((i) => i.clientUserId === clientId && i.submittedAtMs >= start);
        const energies = items.flatMap((i) => {
          const s = parseSubmission(i);
          const q = s?.asked?.find((x) => /energy/i.test(x.prompt));
          const n = q ? s?.answers.find((a) => a.questionId === q.id)?.number : undefined;
          return typeof n === "number" ? [n] : [];
        });
        checkins = { sent: items.length, energy: energies.length ? Math.round((energies.reduce((x, y) => x + y, 0) / energies.length) * 10) / 10 : null };
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load it";
    } finally {
      loaded = true;
    }
  });

  const point = (x: LiftPoint | null) => (!x ? "–" : "kg" in x ? `${x.kg} kg` : `BW × ${x.reps}`);
  function delta(a: LiftPoint | null, b: LiftPoint | null): string {
    if (!a || !b) return "";
    if ("kg" in a && "kg" in b) { const d = Math.round((b.kg - a.kg) * 2) / 2; return d === 0 ? "same" : `${d > 0 ? "+" : ""}${d}`; }
    if ("reps" in a && "reps" in b) { const d = b.reps - a.reps; return d === 0 ? "same" : `${d > 0 ? "+" : ""}${d} reps`; }
    return "";
  }
  const behindText = $derived(review?.behind.map((b) => `${MUSCLE_LABELS[b.muscle].toLowerCase()} (${b.sets} of ${b.target})`).join(", ") ?? "");
  const behindNames = $derived.by(() => {
    const n = review?.behind.map((b) => MUSCLE_LABELS[b.muscle].toLowerCase()) ?? [];
    return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : (n[0] ?? "");
  });

  async function setUp() {
    if (!program || !client || !startIso) return;
    if (next === "different") {
      assignOpen = true;
      return;
    }
    busy = true;
    try {
      const startMs = P.fromDateInputValue(startIso);
      if (startMs == null) throw new Error("Pick a start date.");
      const block = nextBlockFrom(program, {
        startDateMs: startMs,
        lengthWeeks: weeks,
        moreSetsFor: moreSets ? (review?.behind.map((b) => b.muscle) ?? []) : [],
        lighterFirst: lighter,
        keepSwaps: keepSwaps ? swaps : [],
      }, musclesOf);
      await getWebCoachProgramRepo().saveProgram(block, client.username);
      if (sendSummary && review) {
        await messagesApi.send({ relationshipId: client.relationshipId, messageId: createId("msg"), createdAtMs: Date.now(), body: blockSummaryText(program.name, review, startMs) }).catch(() => {});
      }
      toast.success(`${first}'s next block starts ${new Date(startMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`);
      if (next === "copy") await goto(`/clients/${clientId}/programs/${block.id}?u=${encodeURIComponent(client.username)}`);
      else await goto(`/clients/${clientId}?tab=training`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set it up");
    } finally {
      busy = false;
    }
  }

  const NEXT = [
    { value: "rerun", label: "Run it again from their new numbers", hint: "Same program; the progressions start from today's estimates." },
    { value: "copy", label: "Copy it and change things", hint: "Opens the new block in the builder, just for them." },
    { value: "different", label: "Something different", hint: "Pick from your programs, LogIt's or the community's." },
  ] as const;
</script>

<div class="flex flex-col gap-4">
  <PageCrumbs crumbs={[{ label: "Clients", href: "/clients" }, { label: client?.name ?? "Client", href: `/clients/${clientId}`, clientId }, { label: "Training", href: `/clients/${clientId}?tab=training` }, { label: "Next block" }]} />
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">{client ? `${first}'s next block` : "Next block"}</h1>
    {#if program && status}
      <p class="mt-0.5 text-[13px] text-muted-foreground">{program.name} {endsMs && endsMs > Date.now() ? `ends ${new Date(endsMs - DAY).toLocaleDateString(undefined, { weekday: "long" })}` : "has ended"}{status.week ? ` (week ${status.week} of ${status.totalWeeks})` : ""}</p>
    {/if}
  </header>

  {#if !loaded}
    <Skeleton class="h-72" />
  {:else if error}
    <p class="rounded-[10px] bg-muted px-4 py-3 text-[13px]">{error}</p>
  {:else if !program || !client}
    <div class="flex flex-col items-start gap-3 rounded-[12px] border border-border bg-card p-5 text-[13px]">
      <p>{first} isn't on a program from you, so there's nothing to follow on from.</p>
      <Button onclick={() => (assignOpen = true)}>Assign a program…</Button>
    </div>
  {:else}
    <div class="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section class="flex flex-col gap-3 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="How the block went">
        <h2 class="text-sm font-semibold">How the block went</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
          {#if client.sharing.workouts && review}<dt class="text-muted-foreground">Sessions</dt><dd>{review.sessionsDone} of {review.sessionsPlanned}</dd>{/if}
          {#if checkins}<dt class="text-muted-foreground">Check-ins</dt><dd>{checkins.sent} sent{checkins.energy != null ? ` · energy average ${checkins.energy}` : ""}</dd>{/if}
          {#if weight}<dt class="text-muted-foreground">Weight, 7-day average</dt><dd>{weight.start} → {weight.now} kg</dd>{/if}
        </dl>
        {#if !client.sharing.workouts}
          <p class="text-xs text-muted-foreground">{first} doesn't share workouts with you, so there are no numbers from the block.</p>
        {:else if review?.lifts.length}
          <Table.Root class="text-[13px]">
            <Table.Header><Table.Row class="text-[11px] text-muted-foreground"><Table.Head class="h-8">Lift</Table.Head><Table.Head class="h-8">At the start</Table.Head><Table.Head class="h-8">Now</Table.Head><Table.Head class="h-8"></Table.Head></Table.Row></Table.Header>
            <Table.Body>
              {#each review.lifts.slice(0, 6) as l (l.name)}
                {@const d = delta(l.start, l.now)}
                <Table.Row><Table.Cell class="py-1.5 font-medium">{l.name}</Table.Cell><Table.Cell class="py-1.5">{point(l.start)}</Table.Cell><Table.Cell class="py-1.5">{point(l.now)}</Table.Cell><Table.Cell class="py-1.5 tabular-nums {d.startsWith('+') ? 'text-success' : 'text-muted-foreground'}">{d}</Table.Cell></Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
          <p class="text-xs text-muted-foreground">Estimates from their best set in the first two weeks and the last two.</p>
        {:else}
          <p class="text-xs text-muted-foreground">Not enough logged in this block to compare.</p>
        {/if}
        {#if review?.behind.length}<p class="text-[13px]">Muscles behind their weekly sets: {behindText}.</p>{/if}
      </section>

      <section class="flex flex-col gap-4 rounded-[12px] border border-border bg-card px-5 py-4" aria-label="What next">
        <h2 class="text-sm font-semibold">What next</h2>
        <RadioGroup.Root value={next} onValueChange={(v) => (next = v as typeof next)} class="flex flex-col gap-2">
          {#each NEXT as o (o.value)}
            <label class="flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors {next === o.value ? 'border-primary bg-primary/5' : 'border-border'}">
              <RadioGroup.Item value={o.value} aria-label={o.label} class="mt-0.5" />
              <span class="flex flex-col"><span class="text-[13px] font-medium">{o.label}</span><span class="text-xs text-muted-foreground">{o.hint}</span></span>
            </label>
          {/each}
        </RadioGroup.Root>

        {#if next !== "different"}
          <div class="flex flex-col gap-2.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Small changes</span>
            {#if review?.behind.length}
              <label class="flex items-center justify-between gap-3 text-[13px]"><span>One more set on each {behindNames} exercise</span><Switch bind:checked={moreSets} /></label>
            {/if}
            <label class="flex items-center justify-between gap-3 text-[13px]"><span>Start with a lighter week</span><Switch bind:checked={lighter} /></label>
            {#if swaps.length}
              <label class="flex items-center justify-between gap-3 text-[13px]"><span>Keep their swaps ({swaps.map((s) => `${s.from} → ${s.to}`).join(", ")})</span><Switch bind:checked={keepSwaps} /></label>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5"><Label>Starts</Label><DateField aria-label="Starts" class="h-9 text-[13px]" bind:value={startIso} /></div>
            <div class="flex flex-col gap-1.5"><Label>Length</Label>
              <span class="flex h-9 items-center gap-1.5">
                <Button variant="outline" size="icon" class="size-8" aria-label="One week fewer" disabled={weeks <= 1} onclick={() => (weeks -= 1)}>−</Button>
                <span class="w-16 text-center text-[13px] tabular-nums">{weeks} {weeks === 1 ? "week" : "weeks"}</span>
                <Button variant="outline" size="icon" class="size-8" aria-label="One week more" disabled={weeks >= 52} onclick={() => (weeks += 1)}>+</Button>
              </span>
            </div>
          </div>
          {#if client.sharing.workouts && review}
            <label class="flex items-center justify-between gap-3 text-[13px]"><span>Send {first} how the block went too</span><Switch bind:checked={sendSummary} /></label>
          {/if}
        {/if}
        <Button class="self-start" disabled={busy || (next !== "different" && !startIso)} onclick={() => void setUp()}>{busy ? "Setting up…" : next === "different" ? "Pick a program…" : "Set up the next block"}</Button>
      </section>
    </div>
  {/if}
</div>

<AssignProgramDialog bind:open={assignOpen} clientIds={[clientId]} onassigned={() => goto(`/clients/${clientId}?tab=training`)} />
