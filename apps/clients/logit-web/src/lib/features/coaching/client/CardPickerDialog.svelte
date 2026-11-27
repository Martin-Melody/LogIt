<!-- Canvas W11: + Card. Which cards a client's Overview shows, in what order (drag, or the
     arrows), and who that's for: this client, everyone on their package, or all clients. A card
     for something they don't share stays off and says why. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { toast } from "$lib/components/ui/sonner";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import { coachApi } from "@logit/core/api/coachApi";
  import { COACH_CARDS, cardsFor, type CardLayout, type ShareArea } from "@logit/core/domain/coachCards";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import type { ClientSummary } from "../coachingData";

  let { open = $bindable(false), client, packageId = null, packageName = null, layout, onsaved }: {
    open?: boolean; client: ClientSummary; packageId?: string | null; packageName?: string | null; layout: CardLayout | null; onsaved: (l: CardLayout) => void;
  } = $props();

  type Row = { id: string; name: string; on: boolean; plugin: boolean; blocked: string | null; note?: string };
  let rows = $state<Row[]>([]);
  let scope = $state<"client" | "package" | "all">("client");
  let busy = $state(false);
  let dragging = $state<number | null>(null);
  const first = $derived(client.name.split(" ")[0] || client.name);
  const AREA: Record<ShareArea, string> = { workouts: "workouts", nutrition: "food diary", bodyweight: "weight", habits: "habits", checkins: "check-ins" };

  $effect(() => {
    if (!open) return;
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
    const now = cardsFor(layout, client.id, packageId);
    scope = now.from === "default" || now.from === "all" ? "all" : now.from;
    const widgetPlugins = plugins.installed.filter((p) => p.enabled && p.manifest.family === "widget");
    const all: Row[] = [
      ...COACH_CARDS.map((c) => ({ id: c.id as string, name: c.name, on: false, plugin: false, blocked: client.sharing[c.needs] || (c.id === "habits" && client.sharing.checkins) ? null : `Needs ${AREA[c.needs]} shared` })),
      ...widgetPlugins.map((p) => ({ id: `plugin:${p.manifest.id}`, name: p.manifest.name, on: false, plugin: true, blocked: null, note: typeof p.manifest.description === "string" ? p.manifest.description : undefined })),
    ];
    const ordered = [...now.cards.map((id) => all.find((r) => r.id === id)).filter((r): r is Row => !!r).map((r) => ({ ...r, on: !r.blocked })), ...all.filter((r) => !now.cards.includes(r.id))];
    rows = ordered;
  });

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r!);
    rows = next;
  }

  async function save() {
    busy = true;
    const cards = rows.filter((r) => r.on).map((r) => r.id);
    const next: CardLayout = { all: layout?.all ?? null, packages: { ...(layout?.packages ?? {}) }, clients: { ...(layout?.clients ?? {}) } };
    // A wider choice drops this client's own list, so it actually applies to them.
    if (scope !== "client") delete next.clients![client.id];
    if (scope === "client") next.clients![client.id] = cards;
    else if (scope === "package" && packageId) next.packages![packageId] = cards;
    else next.all = cards;
    try {
      const saved = await coachApi.saveCards(next);
      toast.success(scope === "client" ? `Cards saved for ${first}` : scope === "package" ? `Cards saved for everyone on ${packageName}` : "Cards saved for all clients");
      onsaved(saved);
      open = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the cards");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Cards on {first}'s Overview</Dialog.Title>
      <Dialog.Description>Drag to reorder. The same cards show for This week, This month and This block.</Dialog.Description>
    </Dialog.Header>
    <ul class="flex flex-col" aria-label="Cards">
      {#each rows as r, i (r.id)}
        {#if i === 0 || rows[i - 1]!.plugin !== r.plugin}
          <li class="pb-1 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{r.plugin ? "From your plugins" : "From LogIt"}</li>
        {/if}
        <li draggable="true" ondragstart={() => (dragging = i)} ondragend={() => (dragging = null)}
          ondragover={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); dragging = i; } }}
          class="flex items-center gap-2 rounded-lg border-t border-border py-2 text-[13px] transition-colors {dragging === i ? 'bg-muted' : ''}">
          <GripVerticalIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="font-medium">{r.name}</span>
            {#if r.blocked}<span class="text-xs text-muted-foreground">{r.blocked}</span>{:else if r.note}<span class="truncate text-xs text-muted-foreground">{r.note}</span>{/if}
          </span>
          <Button variant="ghost" size="icon" class="size-7" aria-label="Move {r.name} up" disabled={i === 0} onclick={() => move(i, i - 1)}><ArrowUpIcon class="size-3.5" /></Button>
          <Button variant="ghost" size="icon" class="size-7" aria-label="Move {r.name} down" disabled={i === rows.length - 1} onclick={() => move(i, i + 1)}><ArrowDownIcon class="size-3.5" /></Button>
          <Switch checked={r.on} disabled={!!r.blocked} onCheckedChange={(v) => (rows[i] = { ...r, on: v })} aria-label="Show {r.name}" />
        </li>
      {/each}
    </ul>
    <Button variant="outline" size="sm" href="/plugins" class="self-start">Find card plugins in the community</Button>
    <div class="flex flex-col gap-1.5 border-t border-border pt-3">
      <span id="cards-for" class="text-sm font-medium">Use these cards for</span>
      <RadioGroup.Root bind:value={scope} aria-labelledby="cards-for" class="flex flex-col gap-1">
        <Label class="flex cursor-pointer items-center gap-3 font-normal"><RadioGroup.Item value="client" /> {first} only</Label>
        {#if packageId && packageName}<Label class="flex cursor-pointer items-center gap-3 font-normal"><RadioGroup.Item value="package" /> Everyone on {packageName}</Label>{/if}
        <Label class="flex cursor-pointer items-center gap-3 font-normal"><RadioGroup.Item value="all" /> All clients</Label>
      </RadioGroup.Root>
      {#if scope !== "client"}<p class="text-xs text-muted-foreground">Clients you've chosen cards for one by one keep theirs.</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy} onclick={() => void save()}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
