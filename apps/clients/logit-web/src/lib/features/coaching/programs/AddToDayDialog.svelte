<!-- Add to a day (canvas PB4): one search over exercises, cardio and drills, with filters. Pick
     several and add them one after another, or together as a superset (2), tri-set (3), giant set
     (4+) or circuit. Replaces the six "+ Exercise / + Superset / …" buttons. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";

  export type AddKind = "strength" | "cardio" | "mobility";
  export type AddPick = { kind: AddKind; name: string };
  type Hit = { name: string; detail?: string };

  let {
    open = $bindable(false),
    dayName,
    searchExercises,
    searchActivities,
    searchDrills,
    onadd,
    onplugin,
    range = null,
  }: {
    open?: boolean;
    dayName: string;
    searchExercises: (q: string) => Hit[];
    searchActivities: (q: string) => Hit[];
    searchDrills: (q: string) => Hit[];
    /** "one" adds them one after another; "group" as a superset (strength only); "circuit" as one circuit. */
    onadd: (picks: AddPick[], as: "one" | "group" | "circuit", inRange: boolean) => void;
    onplugin: () => void;
    /** The weeks being edited (canvas PX2), e.g. "Weeks 7–9"; null when editing every week. */
    range?: string | null;
  } = $props();
  let inRange = $state(true);

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "strength", label: "Strength" },
    { id: "cardio", label: "Cardio" },
    { id: "mobility", label: "Mobility" },
    { id: "plugin", label: "Plugin blocks" },
  ] as const;
  let filter = $state<(typeof FILTERS)[number]["id"]>("all");
  let q = $state("");
  let picked = $state<AddPick[]>([]);

  $effect(() => {
    if (!open) { q = ""; picked = []; filter = "all"; inRange = true; }
  });

  const groups = $derived.by(() => {
    const out: { kind: AddKind; label: string; hits: Hit[] }[] = [];
    if (!q.trim()) return out;
    if (filter === "all" || filter === "strength") out.push({ kind: "strength", label: "Exercises", hits: searchExercises(q) });
    if (filter === "all" || filter === "cardio") out.push({ kind: "cardio", label: "Cardio", hits: searchActivities(q) });
    if (filter === "all" || filter === "mobility") out.push({ kind: "mobility", label: "Mobility drills", hits: searchDrills(q) });
    return out.filter((g) => g.hits.length);
  });

  const isPicked = (kind: AddKind, name: string) => picked.some((p) => p.kind === kind && p.name === name);
  function toggle(kind: AddKind, name: string) {
    picked = isPicked(kind, name) ? picked.filter((p) => !(p.kind === kind && p.name === name)) : [...picked, { kind, name }];
  }
  const allStrength = $derived(picked.length > 1 && picked.every((p) => p.kind === "strength"));
  const groupName = $derived(picked.length === 2 ? "superset" : picked.length === 3 ? "tri-set" : "giant set");
  function add(as: "one" | "group" | "circuit") {
    onadd(picked, as, !!range && inRange);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[85svh] flex-col gap-3 overflow-hidden sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Add to {dayName}</Dialog.Title>
      <Dialog.Description class="sr-only">Search, pick one or several, then add them.</Dialog.Description>
    </Dialog.Header>
    <Input id="add-to-day-search" bind:value={q} placeholder="Search exercises, cardio, drills…" autofocus aria-label="Search" />
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
      {#each FILTERS as f (f.id)}
        <button type="button" role="radio" aria-checked={filter === f.id} onclick={() => (filter = f.id)}
          class="h-8 rounded-full border px-3 text-xs transition-colors {filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">{f.label}</button>
      {/each}
    </div>
    <div class="min-h-40 flex-1 overflow-y-auto">
      {#if filter === "plugin"}
        <div class="flex flex-col items-start gap-2 rounded-[9px] border border-dashed border-border p-4 text-[13px] text-muted-foreground">
          Blocks from plugins you've installed: timed rounds, climbing, anything a plugin adds. They run code, so clients allow them once.
          <Button variant="outline" size="sm" onclick={() => { open = false; onplugin(); }}>Pick a plugin block…</Button>
        </div>
      {:else if !q.trim()}
        <p class="px-1 py-6 text-center text-[13px] text-muted-foreground">Type to search. Pick several to add them together.</p>
      {:else if !groups.length}
        <p class="px-1 py-6 text-center text-[13px] text-muted-foreground">Nothing called "{q.trim()}".</p>
      {:else}
        {#each groups as g (g.kind)}
          <h3 class="px-1 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{g.label}</h3>
          <ul class="flex flex-col">
            {#each g.hits as h (h.name)}
              <li>
                <label class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                  <Checkbox checked={isPicked(g.kind, h.name)} onCheckedChange={() => toggle(g.kind, h.name)} aria-label="Pick {h.name}" />
                  <span class="flex min-w-0 flex-col"><span class="truncate text-[13px] font-medium">{h.name}</span>{#if h.detail}<span class="truncate text-xs text-muted-foreground">{h.detail}</span>{/if}</span>
                </label>
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </div>
    {#if range}
      <div class="flex items-center gap-2 text-[13px]" role="radiogroup" aria-label="Add it to">
        <span class="text-muted-foreground">In</span>
        {#each [[true, range], [false, "Every week"]] as [v, l] (String(v))}
          <button type="button" role="radio" aria-checked={inRange === v} onclick={() => (inRange = v as boolean)}
            class="h-9 rounded-full border px-3.5 transition-colors {inRange === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}">{l}</button>
        {/each}
      </div>
    {/if}
    <Dialog.Footer class="items-center gap-2 sm:justify-between">
      <span class="min-w-0 truncate text-xs text-muted-foreground">{picked.length ? `${picked.length} picked: ${picked.map((p) => p.name).join(", ")}` : "Nothing picked yet"}</span>
      <span class="flex shrink-0 justify-end gap-2">
        {#if picked.length > 1}
          <Button variant="outline" size="sm" onclick={() => add("circuit")}>As a circuit</Button>
          {#if allStrength}<Button variant="outline" size="sm" onclick={() => add("group")}>As a {groupName}</Button>{/if}
        {/if}
        <Button size="sm" disabled={!picked.length} onclick={() => add("one")}>{picked.length > 1 ? `Add ${picked.length}` : "Add"}</Button>
      </span>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
