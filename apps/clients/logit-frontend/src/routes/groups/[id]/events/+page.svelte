<!-- A group's events (design canvas E2): upcoming, with cancelled ones marked until their day,
     and past. Organisers add one from here too. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ChevronDown } from "lucide-svelte";
  import { eventsApi, gatherSeries, type GroupEvent } from "@logit/core/api/eventsApi";
  import { groupsApi, type Group } from "@logit/core/api/groupsApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import EventRow from "$lib/components/social/EventRow.svelte";
  import EventFormSheet from "$lib/components/social/EventFormSheet.svelte";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let group = $state<Group | null>(null);
  let upcoming = $state<GroupEvent[] | null>(null);
  let past = $state<GroupEvent[]>([]);
  let error = $state(false);
  let adding = $state(false);
  /** Repeating events whose dates are shown. */
  let open = $state(new Set<string>());
  const gathered = $derived(gatherSeries(upcoming ?? []));
  const toggle = (id: string) => (open = open.has(id) ? new Set([...open].filter((x) => x !== id)) : new Set([...open, id]));

  async function load() {
    try {
      [group, upcoming, past] = await Promise.all([groupsApi.get(id), eventsApi.list(id), eventsApi.list(id, true)]);
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function go(e: GroupEvent) {
    try {
      const saved = await eventsApi.answer(e.id, true);
      upcoming = (upcoming ?? []).map((x) => (x.id === e.id ? saved : x));
    } catch {
      toast.error("Couldn't save that. Try again.");
    }
  }
</script>

<PageHeader>
  <BackButton onclick={() => back(`/groups/${id}`)} />
  <span class="flex min-w-0 flex-1 flex-col">
    <h1 class="page-title">Events</h1>
    {#if group}<span class="truncate text-[12px] text-muted-foreground">{group.name}</span>{/if}
  </span>
  {#if group?.me.role === "Organiser"}<button type="button" class="mr-1 h-9 rounded-lg border border-border px-3 text-sm font-medium" onclick={() => (adding = true)}>New event</button>{/if}
</PageHeader>

<div class="flex flex-col pb-24">
  {#if error}
    <p class="px-4 py-10 text-center text-sm text-muted-foreground">Couldn't load the events. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !upcoming}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <h2 class="px-4 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
    {#if upcoming.length}
      <div class="mx-3 rounded-2xl border border-border bg-card">
        {#each gathered as g (g.event.id)}
          <EventRow event={g.event} ongo={go} />
          {#if g.dates.length}
            {@const shown = open.has(g.event.seriesId ?? "")}
            <button type="button" aria-expanded={shown} class="flex min-h-11 w-full items-center gap-1.5 border-b border-border pl-[4.4rem] pr-3.5 text-left text-[13px] font-medium text-muted-foreground last:border-b-0" onclick={() => toggle(g.event.seriesId ?? "")}>
              {shown ? "Hide the other dates" : `${g.dates.length} more ${g.dates.length === 1 ? "date" : "dates"}`}<ChevronDown class="size-4 transition-transform {shown ? 'rotate-180' : ''}" />
            </button>
            {#if shown}<div class="bg-muted/30">{#each g.dates as d (d.id)}<EventRow event={{ ...d, repeats: null }} ongo={go} />{/each}</div>{/if}
          {/if}
        {/each}
      </div>
    {:else}
      <p class="px-4 py-2 text-sm text-muted-foreground">Nothing planned yet.{group?.me.role === "Organiser" ? " Add a session, a meet or a race." : ""}</p>
    {/if}
    {#if past.length}
      <h2 class="px-4 pb-1.5 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past</h2>
      <div class="mx-3 rounded-2xl border border-border bg-card">{#each past as e (e.id)}<EventRow event={e} past />{/each}</div>
    {/if}
  {/if}
</div>

{#if adding && group}
  <EventFormSheet groupId={group.id} place={group.place} onclose={() => (adding = false)} onsaved={() => void load()} />
{/if}
