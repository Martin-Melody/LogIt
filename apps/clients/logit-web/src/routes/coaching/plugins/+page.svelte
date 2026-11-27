<!-- Coaching › Plugins (canvas Q1): the same plugin directory as Me › Plugins, filtered to the
     kinds a coach uses with clients. "Runs code" plugins ask clients to allow them (PG8); packs
     are data and just go along. Used in, and a warning before uninstalling something in use. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { pluginsApi, type HostedRegistryEntry, type ServedManifest } from "@logit/core/api/pluginsApi";
  import { coachApi, type RosterEntry } from "@logit/core/api/coachApi";
  import { familyLabel, getsSummary, isCodeFamily, pluginCan } from "@logit/core/plugins/pluginInfo";
  import { pluginsNeeded } from "@logit/core/domain/programPlan";
  import type { CoachProgram } from "@logit/core/domain/CoachProgram";
  import { plugins } from "$lib/features/plugins/pluginData.svelte";
  import InstallDialog from "$lib/features/plugins/InstallDialog.svelte";
  import { getWebCoachProgramRepo } from "$lib/deps";

  const KINDS: [string, string][] = [
    ["all", "All"], ["progression-algorithm", "Progression rules"], ["nutrition-algorithm", "Nutrition targets"], ["workout-block", "Workout blocks"],
    ["exercise-pack", "Exercise packs"], ["program-pack", "Program packs"], ["meal-plan-pack", "Meal plan packs"], ["recipe-pack", "Recipe packs"], ["card-pack", "Card packs"], ["question-pack", "Question packs"],
    // Canvas W9/W11: a widget can be a card on a client's page (+ Card), over their data.
    ["widget", "Client cards"],
  ];
  const COACH = new Set(KINDS.slice(1).map(([k]) => k));
  // Packs used straight from the directory: where a coach copies from.
  const USE_AT: Record<string, string> = { "program-pack": "/coaching/programs?start=community", "meal-plan-pack": "/coaching/nutrition?tab=plans", "recipe-pack": "/coaching/nutrition?tab=recipes" };

  const tab = $derived(page.url.searchParams.get("tab") === "community" ? "community" : "installed");
  let kind = $state("all");
  let query = $state("");
  let selectedId = $state<string | null>(page.url.searchParams.get("p"));
  let programs = $state<CoachProgram[]>([]);
  let roster = $state<RosterEntry[]>([]);
  let installing = $state<ServedManifest | null>(null);
  let removing = $state<{ id: string; name: string; uses: string[] } | null>(null);

  onMount(() => {
    void plugins.loadCatalog();
    if (!plugins.installsLoaded) void plugins.loadInstalls().catch(() => {});
    void getWebCoachProgramRepo().listMyPrograms().then((r) => (programs = r.map((x) => x.program).filter((p) => !p.archived))).catch(() => {});
    void coachApi.getRoster().then((r) => (roster = r)).catch(() => {});
  });

  type Row = { id: string; name: string; description: string; family: string; author?: string; reviewedAt?: string | null; installed: boolean; enabled: boolean; manifestUrl?: string };
  const rows = $derived.by((): Row[] => {
    const catalog = (plugins.catalog ?? []).filter((e) => COACH.has(e.family));
    const installed = plugins.installed.filter((p) => COACH.has(p.manifest.family));
    const inst = new Map(installed.map((p) => [p.manifest.id, p]));
    const list: Row[] = tab === "installed"
      ? installed.map((p) => ({ id: p.manifest.id, name: p.manifest.name, description: typeof p.manifest.description === "string" ? p.manifest.description : "", family: p.manifest.family, author: typeof p.manifest.author === "string" ? p.manifest.author : undefined, installed: true, enabled: p.enabled, reviewedAt: catalog.find((e) => e.id === p.manifest.id)?.reviewedAt }))
      : catalog.map((e) => ({ id: e.id, name: e.name, description: e.description, family: e.family, author: e.author, reviewedAt: e.reviewedAt, manifestUrl: e.manifestUrl, installed: inst.has(e.id), enabled: inst.get(e.id)?.enabled ?? false }));
    const q = query.trim().toLowerCase();
    return list.filter((r) => (kind === "all" || r.family === kind) && (!q || `${r.name} ${r.description} ${r.author ?? ""}`.toLowerCase().includes(q)));
  });
  const selected = $derived(rows.find((r) => r.id === selectedId) ?? rows[0] ?? null);

  /** Canvas Q1: where a plugin is used in your programs. */
  function usedIn(id: string): string[] {
    return programs.flatMap((p) => pluginsNeeded(p).filter((n) => n.pluginId === id).flatMap((n) => n.where.map((w) => `${p.name} (${w})`)));
  }
  function allowedBy(id: string): { yes: number; asked: number } {
    const asked = roster.filter((r) => r.pluginConsent && id in r.pluginConsent);
    return { yes: asked.filter((r) => r.pluginConsent![id]!.state === "allowed").length, asked: asked.length };
  }

  function setTab(t: string) {
    const u = new URL(page.url);
    if (t === "installed") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
    void goto(u, { noScroll: true, keepFocus: true, replaceState: true });
  }
  async function install(e: Row) {
    try { installing = (await pluginsApi.listed(e.id)).manifest; } catch (x) { toast.error(x instanceof Error ? x.message : "Couldn't load that plugin"); }
  }
  async function uninstall(id: string, name: string) {
    try {
      await plugins.remove(id);
      toast.success(`Uninstalled ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't uninstall it");
    } finally {
      removing = null;
    }
  }
  async function openSource(r: Row) {
    try {
      const m = (await pluginsApi.listed(r.id)).manifest;
      window.open(m.distribution.bundleUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open it");
    }
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Plugins</h1>
      <p class="mt-1 text-[13px] text-muted-foreground">The kinds you use with clients. A widget here can be a card on a client's page too; analytics are in Me › Plugins.</p>
    </div>
    <Tabs.Root value={tab} onValueChange={setTab}>
      <Tabs.List aria-label="Which plugins">
        <Tabs.Trigger value="installed">Installed {plugins.installed.filter((p) => COACH.has(p.manifest.family)).length}</Tabs.Trigger>
        <Tabs.Trigger value="community">Community</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </header>

  <div class="flex flex-wrap items-center gap-2">
    <input type="search" bind:value={query} placeholder="Search plugins" aria-label="Search plugins" class="h-9 w-56 rounded-[9px] border border-input bg-background px-3 text-[13px]" />
    <ToggleGroup.Root type="single" variant="outline" spacing={2} class="flex-wrap justify-start" bind:value={() => kind, (v: string) => { if (v) kind = v; }} aria-label="Kind">
      {#each KINDS as [k, label] (k)}<ToggleGroup.Item value={k} class="h-8 rounded-full px-3 text-xs data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground!">{label}</ToggleGroup.Item>{/each}
    </ToggleGroup.Root>
  </div>

  {#if !plugins.catalog && !plugins.installsLoaded}
    <Skeleton class="h-64" />
  {:else}
    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Plugins" class="flex flex-col rounded-[10px] border border-border bg-card">
        {#each rows as r (r.id)}
          <button type="button" onclick={() => (selectedId = r.id)} aria-current={selected?.id === r.id ? "true" : undefined}
            class="flex items-center gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 {selected?.id === r.id ? 'bg-muted/60' : 'hover:bg-muted/30'}">
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">{r.name}
                <span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{familyLabel(r.family)}</span>
                {#if isCodeFamily(r.family)}<span class="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium">Runs code</span>{/if}
              </span>
              <span class="text-xs text-muted-foreground">{r.author ? `by ${r.author.startsWith("@") ? "" : "@"}${r.author}` : "by LogIt"}{r.reviewedAt ? ` · updated ${new Date(r.reviewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}{r.installed ? " · installed" : ""}</span>
            </span>
          </button>
        {:else}
          <p class="px-4 py-6 text-[13px] text-muted-foreground">{tab === "installed" ? "Nothing installed for coaching yet. Look in Community." : "Nothing matches."}</p>
        {/each}
      </section>

      {#if selected}
        {@const uses = usedIn(selected.id)}
        {@const allowed = allowedBy(selected.id)}
        <aside aria-label={selected.name} class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-4 text-[13px] lg:sticky lg:top-4">
          <h2 class="text-base font-semibold">{selected.name}</h2>
          {#if selected.description}<p class="leading-relaxed text-muted-foreground">{selected.description}</p>{/if}
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt class="text-muted-foreground">Kind</dt><dd>{familyLabel(selected.family)}{isCodeFamily(selected.family) ? " · runs code" : " · data"}</dd>
            <dt class="text-muted-foreground">Reviewed by LogIt</dt><dd>{selected.reviewedAt ? `Yes, ${new Date(selected.reviewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : selected.installed && tab === "installed" ? "Installed from a link" : "Yes"}</dd>
            <dt class="text-muted-foreground">It is given</dt><dd>{getsSummary(selected.family, null)}</dd>
            <dt class="text-muted-foreground">It can</dt><dd>{selected.family === "widget" ? "Be a card on a client's page (+ Card on their Overview), given only their data it asks for and they share; and a card on your own home" : pluginCan(selected.family).join("; ") || "–"}</dd>
            {#if isCodeFamily(selected.family)}<dt class="text-muted-foreground">It can't</dt><dd>Go online or keep data</dd>{/if}
            {#if selected.family === "workout-block" || selected.family === "progression-algorithm"}
              <dt class="text-muted-foreground">Used in</dt><dd>{uses.length ? uses.join("; ") : "None of your programs"}</dd>
              {#if allowed.asked}<dt class="text-muted-foreground">Clients who allowed it</dt><dd>{allowed.yes} of {allowed.asked}</dd>{/if}
            {/if}
          </dl>
          <span class="flex flex-wrap gap-2">
            {#if USE_AT[selected.family]}
              <Button size="sm" href={USE_AT[selected.family]}>Copy from it</Button>
            {:else if !selected.installed}
              <Button size="sm" onclick={() => void install(selected)}>Install</Button>
            {:else}
              <Button size="sm" variant="outline" class="text-destructive" onclick={() => (removing = { id: selected.id, name: selected.name, uses })}>Uninstall…</Button>
            {/if}
            {#if tab === "community" || selected.manifestUrl}<Button size="sm" variant="ghost" onclick={() => void openSource(selected)}>Open the source</Button>{/if}
          </span>
          {#if isCodeFamily(selected.family) && selected.family !== "card-pack"}<p class="text-xs text-muted-foreground">Runs code: clients are asked to allow it before it runs on their phone.</p>{/if}
        </aside>
      {/if}
    </div>
  {/if}
</div>

<InstallDialog bind:manifest={installing} />

<AlertDialog.Root open={!!removing} onOpenChange={(o) => { if (!o) removing = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Uninstall {removing?.name}?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if removing?.uses.length}
          {removing.uses.length === 1 ? "A program uses it" : `${removing.uses.length} places in your programs use it`}: {removing.uses.join("; ")}. Those turn into plain notes for clients, which they log by hand.
        {:else}
          Nothing of yours uses it. You can install it again any time.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Keep it</AlertDialog.Cancel>
      <AlertDialog.Action class="bg-destructive text-white hover:bg-destructive/90" onclick={() => removing && void uninstall(removing.id, removing.name)}>Uninstall</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
