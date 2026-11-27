<!-- Canvas PG8: the coach's program uses a plugin this phone doesn't have (or doesn't let run).
     Allow adds it for this coach's programs only; Not now leaves the block as a plain note and
     the rule as "same as last time", and the coach sees which. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { toast } from "$lib/components/ui/sonner";
  import { slide } from "svelte/transition";
  import { pluginsApi } from "@logit/core/api/pluginsApi";
  import { allowProgramPlugin, declineProgramPlugin, toldCoach, type ProgramPlugin } from "./programPlugins";

  let { plugin, coachName, relationshipId, onchange }: {
    plugin: ProgramPlugin;
    coachName: string;
    relationshipId: string | null;
    onchange: () => void;
  } = $props();

  let busy = $state(false);
  const first = $derived(coachName.split(" ")[0] || "Your coach");
  const declined = $derived(relationshipId ? toldCoach(relationshipId, plugin.pluginId) === "declined" : false);
  let open = $state(true);
  // svelte-ignore state_referenced_locally
  if (declined) open = false;
  // LogIt's own: the reserved id prefix (only admins publish under it), from LogIt's server.
  const byLogIt = $derived(plugin.pluginId.startsWith("app.getlogit.") && plugin.entry?.sourceUrl === pluginsApi.registryUrl());

  async function allow() {
    busy = true;
    try {
      await allowProgramPlugin(plugin, relationshipId);
      toast.success(`${plugin.name} is on for ${first}'s programs`);
      onchange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add it");
    } finally {
      busy = false;
    }
  }
  async function notNow() {
    busy = true;
    try {
      await declineProgramPlugin(plugin, relationshipId);
    } catch {
      /* the coach hears next time; the program works either way */
    } finally {
      busy = false;
      open = false;
    }
  }
</script>

{#if open}
  <section transition:slide={{ duration: 180 }} class="mx-3 my-2 flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-4" aria-label="{plugin.name} plugin">
    <p class="text-[15px] font-semibold">{first}'s program uses {byLogIt ? "a plugin" : "a community plugin"}</p>
    <p class="text-sm text-muted-foreground">
      {plugin.kind === "block" ? "One block runs" : "Some of the numbers are worked out"} on {plugin.name}{byLogIt ? ", a LogIt plugin." : ", made by someone in the LogIt community, not by LogIt."}
    </p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-muted-foreground">Plugin</dt><dd>{plugin.name}{byLogIt ? " · by LogIt" : plugin.entry?.author ? ` · by ${plugin.entry.author}` : ""}</dd>
      <dt class="text-muted-foreground">Used for</dt><dd>{plugin.where.join("; ")}</dd>
      <dt class="text-muted-foreground">It can see</dt><dd>{plugin.kind === "block" ? "That block's entries only" : "Your sets of those exercises"}</dd>
      <dt class="text-muted-foreground">It can't</dt><dd>Read your other data or go online</dd>
    </dl>
    {#if !plugin.entry}
      <p class="text-xs text-muted-foreground">{plugin.name} isn't in the plugin list any more, so it can't be added. The rest of the program works.</p>
    {:else if !byLogIt}
      <p class="text-xs text-muted-foreground">Community plugins are checked before they're listed, but LogIt didn't write them. You can turn this off any time in Settings › Plugins.</p>
    {/if}
    <div class="flex gap-2">
      <Button class="h-11 flex-1" disabled={busy || !plugin.entry} onclick={() => void allow()}>{busy ? "Adding…" : `Allow for ${first}'s programs`}</Button>
      <Button variant="outline" class="h-11" disabled={busy} onclick={() => void notNow()}>Not now</Button>
    </div>
    <p class="text-xs text-muted-foreground">Not now: {plugin.kind === "block" ? "the block shows as a note" : "those exercises repeat last time's numbers"} and the rest of the program works. {first} sees that you haven't allowed it.</p>
  </section>
{:else}
  <div class="mx-3 my-2 flex items-center justify-between gap-2 rounded-[12px] border border-border px-3 py-2">
    <span class="text-xs text-muted-foreground">{plugin.name} isn't allowed, so {plugin.kind === "block" ? "its block is a note" : "those exercises repeat last time"}.</span>
    <Button variant="outline" size="sm" onclick={() => (open = true)}>Allow…</Button>
  </div>
{/if}
