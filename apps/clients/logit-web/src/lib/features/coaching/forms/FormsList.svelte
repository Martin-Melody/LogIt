<!-- Check-ins › Forms (canvas F1): every form you send, in one list, one editor for all of them.
     The ask-to-be-coached questions, the start-up form, then your check-in forms with who gets
     them and whose version is their own. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { coachApi } from "@logit/core/api/coachApi";
  import { archiveCheckinSchedule, readyMadeForm, type CheckinSchedule } from "@logit/core/domain/Checkin";
  import { createId } from "@logit/core/domain/ids";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { toast } from "$lib/components/ui/sonner";
  import ActionMenu from "$lib/features/commands/ActionMenu.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import type { ClientSummary } from "$lib/features/coaching/coachingData";
  import { getWebCheckinRepo } from "$lib/deps";
  import SendFormDialog from "./SendFormDialog.svelte";

  let { clients }: { clients: ClientSummary[] } = $props();

  let shared = $state<CheckinSchedule[] | null>(null);
  let copies = $state<{ recipientUserId: string; schedule: CheckinSchedule }[]>([]);
  let askCount = $state<number | null>(null);
  let sending = $state<string | null>(null);
  let sendOpen = $state(false);

  async function load() {
    const [all, intake] = await Promise.all([getWebCheckinRepo().listMySchedules(), coachApi.getIntake().catch(() => null)]);
    shared = all.filter((r) => !r.recipientUserId && !r.schedule.archived).map((r) => r.schedule)
      .sort((a, b) => Number(b.kind === "startup") - Number(a.kind === "startup") || b.updatedAtMs - a.updatedAtMs);
    copies = all.filter((r) => r.recipientUserId).map((r) => ({ recipientUserId: r.recipientUserId!, schedule: r.schedule }));
    askCount = intake?.questions.length ?? null;
  }
  onMount(() => void load().catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your forms")));

  const startup = $derived(shared?.find((f) => f.kind === "startup") ?? null);
  const checkins = $derived(shared?.filter((f) => f.kind !== "startup") ?? []);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "A client";
  const who = (f: CheckinSchedule) => copies.filter((c) => c.schedule.sourceId === f.id && !c.schedule.archived);
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const when = (f: CheckinSchedule) =>
    f.cadence === "weekly" ? `Every ${new Date(f.anchorMs).toLocaleDateString(undefined, { weekday: "long" })}` : f.cadence === "monthly" ? "Monthly" : f.cadence === "biweekly" ? "Every 2 weeks" : "Once";

  async function create(which: "blank" | "weekly" | "health" | "monthly" | "startup") {
    const f = which === "blank" ? { ...readyMadeForm("weekly"), name: "New form", questions: [] } : readyMadeForm(which);
    await getWebCheckinRepo().saveSchedule(f);
    await goto(`/coaching/checkins/forms/${f.id}`);
  }

  async function duplicate(f: CheckinSchedule) {
    const now = Date.now();
    const copy = { ...f, id: createId("ckin"), name: `${f.name} (copy)`, kind: undefined, autoStart: undefined, createdAtMs: now, updatedAtMs: now };
    await getWebCheckinRepo().saveSchedule(copy);
    toast.success("Duplicated");
    await load();
  }

  async function archive(f: CheckinSchedule) {
    await getWebCheckinRepo().saveSchedule(archiveCheckinSchedule(f));
    toast.success(`${f.name} archived. Clients who get it keep their copy.`);
    await load();
  }

  const actionsFor = (f: CheckinSchedule): RowAction[] => [
    { id: "open", label: "Edit the form", href: `/coaching/checkins/forms/${f.id}` },
    { id: "send", label: "Who gets it…", run: () => { sending = f.id; sendOpen = true; }, separatorBefore: true },
    { id: "duplicate", label: "Duplicate", run: () => void duplicate(f) },
    { id: "archive", label: "Archive", run: () => void archive(f), danger: true, separatorBefore: true },
  ];
</script>

<section class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-[13px] text-muted-foreground">Every form you send, in one list. One editor for all of them.</p>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props}>New form</Button>{/snippet}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-56">
        <DropdownMenu.Item onSelect={() => void create("blank")}>Blank form</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Label>From LogIt</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => void create("weekly")}>Weekly check-in</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => void create("health")}>Health questions</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => void create("monthly")}>Monthly review</DropdownMenu.Item>
        {#if !startup}<DropdownMenu.Item onSelect={() => void create("startup")}>Start-up form</DropdownMenu.Item>{/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  {#if shared === null}
    <Skeleton class="h-56" />
  {:else}
    <ul class="flex flex-col rounded-[10px] border border-border bg-card" aria-label="Forms">
      <li class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
          <span class="flex items-center gap-2 text-[13px] font-semibold">Ask to be coached <Badge variant="secondary">Asking</Badge></span>
          <span class="text-xs text-muted-foreground">{askCount ?? 5} questions · shown when someone taps Ask to be coached on your profile or a link</span>
        </span>
        <Button variant="outline" size="sm" href="/coaching/checkins/forms/ask">Edit</Button>
      </li>
      <li class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
          <span class="flex items-center gap-2 text-[13px] font-semibold">{startup?.name ?? "Start-up form"} <Badge variant="secondary">After taking a spot</Badge></span>
          <span class="text-xs text-muted-foreground">
            {startup ? `${startup.questions.length} questions · new clients fill it in once · edited ${day(startup.updatedAtMs)}` : "None yet. New clients fill it in once, after they take a spot: health, measurements, photos, food."}
          </span>
        </span>
        {#if startup}<Button variant="outline" size="sm" href="/coaching/checkins/forms/{startup.id}">Edit</Button>
        {:else}<Button size="sm" onclick={() => void create("startup")}>Make one</Button>{/if}
      </li>
      {#each checkins as f (f.id)}
        {@const gets = who(f)}
        {@const own = gets.filter((c) => c.schedule.own)}
        <ActionMenu actions={actionsFor(f)} label="More for {f.name}">
          {#snippet children({ props, more })}
            <li {...props} class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0 data-[state=open]:bg-muted">
              <a href="/coaching/checkins/forms/{f.id}" class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                <span class="flex items-center gap-2 text-[13px] font-semibold">{f.name} <Badge variant="outline">{when(f)}</Badge>{#if f.autoStart}<Badge variant="secondary">New clients get it</Badge>{/if}</span>
                <span class="text-xs text-muted-foreground">
                  {f.questions.length} questions · {gets.length} {gets.length === 1 ? "client" : "clients"}{own.length ? ` · ${own.map((c) => nameOf(c.recipientUserId)).join(" and ")} ${own.length === 1 ? "has their" : "have their"} own version` : ""} · edited {day(f.updatedAtMs)}
                </span>
              </a>
              <Button variant="outline" size="sm" onclick={() => { sending = f.id; sendOpen = true; }}>Who gets it</Button>
              {@render more()}
            </li>
          {/snippet}
        </ActionMenu>
      {:else}
        <li class="px-4 py-6 text-center text-[13px] text-muted-foreground">No check-in forms yet. Start from LogIt's weekly check-in under New form.</li>
      {/each}
    </ul>
  {/if}
</section>

<SendFormDialog bind:open={sendOpen} forms={checkins} {copies} {clients} formId={sending} onsent={load} />
