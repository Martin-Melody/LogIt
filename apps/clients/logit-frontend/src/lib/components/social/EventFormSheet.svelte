<!-- New event and Edit event (design canvas E1, V3, organisers): name, what it is, sport, day and
     time, repeats (every week or two on chosen days, until a date; new events only), where (the
     group's place to start with), details, and an optional push to members. A new time or place
     is pushed to everyone going. Editing a repeating event changes `scope` (V4). -->
<script lang="ts">
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { Repeat } from "lucide-svelte";
  import { EVENT_KINDS, EVENT_SPORTS, eventsApi, type EventKind, type EventScope, type EventSport, type GroupEvent } from "@logit/core/api/eventsApi";
  import { repeatDates, repeatLabel, WEEKDAYS } from "@logit/core/domain/eventRepeat";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DateField } from "$lib/components/ui/date-field";
  import { TimeField } from "$lib/components/ui/time-field";
  import Switch from "$lib/components/ui/switch/Switch.svelte";

  const { groupId, place: groupPlace = null, event = null, scope = "one", onclose, onsaved }: {
    groupId: string;
    /** The group's place, to start with. */
    place?: string | null;
    event?: GroupEvent | null;
    /** Editing a repeating event: this date, or this and every later one. */
    scope?: EventScope;
    onclose: () => void;
    onsaved: (e: GroupEvent) => void;
  } = $props();

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // svelte-ignore state_referenced_locally
  const start = event ? new Date(event.startsAtMs) : (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay() || 7)); d.setHours(9, 0, 0, 0); return d; })();

  // svelte-ignore state_referenced_locally
  let title = $state(event?.title ?? "");
  // svelte-ignore state_referenced_locally
  let kind = $state<EventKind>(event?.kind ?? "Session");
  let day = $state(isoDay(start));
  let from = $state(hhmm(start));
  // svelte-ignore state_referenced_locally
  let to = $state(event?.endsAtMs ? hhmm(new Date(event.endsAtMs)) : "");
  // svelte-ignore state_referenced_locally
  let where = $state(event ? (event.place ?? "") : (groupPlace ?? ""));
  // svelte-ignore state_referenced_locally
  let details = $state(event?.details ?? "");
  let notify = $state(true);
  // svelte-ignore state_referenced_locally
  let sport = $state<EventSport | null>(event?.sport ?? null);
  // svelte-ignore state_referenced_locally
  let moreSports = $state(!!event?.sport && EVENT_SPORTS.indexOf(event.sport) >= 5);
  let every = $state<0 | 1 | 2>(0);
  let days = $state<number[]>([start.getDay()]);
  let until = $state(isoDay(new Date(start.getFullYear(), start.getMonth() + 3, start.getDate())));
  // Keep the first day's weekday among the repeat days when the day changes.
  $effect(() => {
    const first = new Date(`${day}T12:00`).getDay();
    if (!Number.isNaN(first) && !days.includes(first)) days = [...days, first];
  });
  const dates = $derived(every && day && from && until ? repeatDates({ firstDay: day, from, to: to || null, days, every, until }) : []);
  let saving = $state(false);

  const at = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const [y, mo, d] = day.split("-").map(Number);
    return new Date(y!, mo! - 1, d!, h!, m!);
  };

  async function save() {
    if (!title.trim() || !day || !from) return;
    const startsAt = at(from);
    let endsAt = to ? at(to) : null;
    if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000); // past midnight
    saving = true;
    try {
      const body = { title: title.trim(), kind, sport, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, place: where.trim(), details: details.trim() };
      const repeat = !event && every && dates.length > 1
        ? { dates: dates.map((d) => ({ startsAt: d.startsAt.toISOString(), endsAt: d.endsAt?.toISOString() ?? null })), repeats: repeatLabel(days, every) }
        : {};
      const saved = event
        ? await eventsApi.edit(event.id, { ...body, clearEnd: !endsAt, clearSport: !sport, scope })
        : await eventsApi.create(groupId, { ...body, notify, ...repeat });
      onsaved(saved);
      toast.success(event ? "Event saved" : "dates" in repeat ? `${repeat.dates!.length} events added` : "Event added");
      onclose();
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't save the event. Try again.");
    } finally {
      saving = false;
    }
  }
</script>

<BottomSheet label={event ? "Edit event" : "New event"} {onclose} tall>
  <form class="flex flex-col gap-4 px-4 pb-2" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <h2 class="text-[19px] font-semibold">{event ? "Edit event" : "New event"}</h2>
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Name</span>
      <Input bind:value={title} maxlength={80} placeholder="Deadlift day" class="h-12 text-[15px]" />
    </label>
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-medium" id="event-kind">What is it?</span>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="event-kind">
        {#each EVENT_KINDS as k (k)}<button type="button" role="radio" aria-checked={kind === k} class={chip(kind === k)} onclick={() => (kind = k)}>{k}</button>{/each}
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-medium" id="event-sport">Sport (optional)</span>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="event-sport">
        {#each EVENT_SPORTS.slice(0, moreSports ? EVENT_SPORTS.length : 5) as sp (sp)}
          <button type="button" role="radio" aria-checked={sport === sp} class={chip(sport === sp)} onclick={() => (sport = sport === sp ? null : sp)}>{sp}</button>
        {/each}
        {#if !moreSports}<button type="button" class={chip(false)} onclick={() => (moreSports = true)}>More…</button>{/if}
      </div>
    </div>
    <div class="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">{every ? "First day" : "Day"}</span><DateField bind:value={day} minIso={isoDay(new Date())} aria-label="Day" /></label>
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">Starts</span><TimeField bind:value={from} aria-label="Starts" /></label>
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">Ends</span><TimeField bind:value={to} aria-label="Ends (optional)" /></label>
    </div>
    {#if !event}
      <div class="flex flex-col gap-2">
        <span class="flex items-center gap-1.5 text-[13px] font-medium" id="event-repeat"><Repeat class="size-3.5" />Repeats</span>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="event-repeat">
          {#each [[0, "Never"], [1, "Every week"], [2, "Every 2 weeks"]] as [v, label] (v)}
            <button type="button" role="radio" aria-checked={every === v} class={chip(every === v)} onclick={() => (every = v as 0 | 1 | 2)}>{label}</button>
          {/each}
        </div>
        {#if every}
          <div class="flex justify-between" role="group" aria-label="On these days">
            {#each [1, 2, 3, 4, 5, 6, 0] as d (d)}
              <button type="button" aria-pressed={days.includes(d)} aria-label={WEEKDAYS[d]}
                class="size-10 rounded-full text-[13px] {days.includes(d) ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border'}"
                onclick={() => (days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{WEEKDAYS[d]!.charAt(0)}</button>
            {/each}
          </div>
          <label class="flex flex-col gap-1.5"><span class="text-[13px] font-medium">Until</span><DateField bind:value={until} minIso={day} aria-label="Until" /></label>
          <span class="text-[12px] leading-snug text-muted-foreground">{days.length ? `${repeatLabel(days, every)}, until ${new Date(`${until}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${dates.length} ${dates.length === 1 ? "date" : "dates"}${dates.length >= 120 ? " (the most at once)" : ""}. Each one has its own Going list and reminder.` : "Pick at least one day."}</span>
        {/if}
      </div>
    {/if}
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Where</span>
      <Input bind:value={where} maxlength={120} placeholder="The gym, a park, a race" class="h-12 text-[15px]" />
      {#if !event}<span class="text-[12px] text-muted-foreground">The group's place to start with. Change it for a race or a park session.</span>{/if}
    </label>
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Details (optional)</span>
      <Textarea bind:value={details} rows={3} maxlength={1000} placeholder="What you'll do, what to bring" class="min-h-24 text-[15px]" />
    </label>
    {#if event}
      <p class="text-[13px] leading-snug text-muted-foreground">{scope === "following" ? "Changes this date and every one after it. " : ""}A new time or place is pushed to everyone going.</p>
    {:else}
      <div class="flex min-h-14 items-center gap-3 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
        <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Let members know</span><span class="text-[13px] text-muted-foreground">A push to members with "Events, notes and mentions" on</span></span>
        <Switch checked={notify} label="Let members know" onchange={(v) => (notify = v)} />
      </div>
    {/if}
    <button type="submit" disabled={saving || !title.trim() || !day || !from || (!!every && dates.length === 0)} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">{event ? "Save" : every && dates.length > 1 ? `Add ${dates.length} events` : "Add event"}</button>
  </form>
</BottomSheet>
