<!-- New event and Edit event (design canvas E1, organisers): name, what it is, day and time, where
     (the group's place to start with), details, and an optional push to members. A new time or
     place is pushed to everyone going. -->
<script lang="ts">
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { EVENT_KINDS, eventsApi, type EventKind, type GroupEvent } from "@logit/core/api/eventsApi";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DateField } from "$lib/components/ui/date-field";
  import { TimeField } from "$lib/components/ui/time-field";
  import Switch from "$lib/components/ui/switch/Switch.svelte";

  const { groupId, place: groupPlace = null, event = null, onclose, onsaved }: {
    groupId: string;
    /** The group's place, to start with. */
    place?: string | null;
    event?: GroupEvent | null;
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
      const body = { title: title.trim(), kind, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, place: where.trim(), details: details.trim() };
      const saved = event
        ? await eventsApi.edit(event.id, { ...body, clearEnd: !endsAt })
        : await eventsApi.create(groupId, { ...body, notify });
      onsaved(saved);
      toast.success(event ? "Event saved" : "Event added");
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
    <div class="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">Day</span><DateField bind:value={day} minIso={isoDay(new Date())} aria-label="Day" /></label>
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">Starts</span><TimeField bind:value={from} aria-label="Starts" /></label>
      <label class="flex min-w-0 flex-col gap-1.5"><span class="text-[13px] font-medium">Ends</span><TimeField bind:value={to} aria-label="Ends (optional)" /></label>
    </div>
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
      <p class="text-[13px] leading-snug text-muted-foreground">A new time or place is pushed to everyone going.</p>
    {:else}
      <div class="flex min-h-14 items-center gap-3 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
        <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Let members know</span><span class="text-[13px] text-muted-foreground">A push to members with "Events, notes and mentions" on</span></span>
        <Switch checked={notify} label="Let members know" onchange={(v) => (notify = v)} />
      </div>
    {/if}
    <button type="submit" disabled={saving || !title.trim() || !day || !from} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">{event ? "Save" : "Add event"}</button>
  </form>
</BottomSheet>
