<!-- The coaching walkthrough's start (canvas V5): practise on sample clients in Practice view,
     or, for a Studio coach with clients, use real ones. Trying Studio, samples are the only way. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { chaptersOf, guide } from "./guide.svelte";
  import { practice, sandbox, SAMPLES } from "./sandbox.svelte";

  const open = $derived(guide.askStudioMode !== null);

  async function useSamples() {
    if (!sandbox.on) await sandbox.add();
    if (!sandbox.error) guide.chooseStudioMode("samples");
  }
</script>

<Dialog.Root open={open} onOpenChange={(o) => { if (!o) guide.askStudioMode = null; }}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coaching walkthrough · {chaptersOf("studio").length} short chapters</p>
      <Dialog.Title class="text-xl">Practise on sample clients</Dialog.Title>
      <Dialog.Description class="text-sm leading-relaxed">
        This switches on Practice view: {SAMPLES.map((s) => s.displayName.split(" ")[0]).join(", ").replace(/, ([^,]*)$/, " and $1")}. Your real clients aren't shown or touched.
        The walkthrough has you do everything for real, and the samples answer on their own a few seconds after you act.
      </Dialog.Description>
    </Dialog.Header>

    <ul class="flex flex-col">
      {#each SAMPLES as s (s.key)}
        <li class="flex gap-3 border-t border-border py-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{s.displayName[0]}</span>
          <div>
            <div class="text-sm font-semibold">{s.displayName} <span class="ml-1 rounded-full bg-info/15 px-1.5 py-px text-[10px] font-semibold text-info">Sample</span></div>
            <p class="text-sm leading-relaxed text-muted-foreground">{s.about}</p>
          </div>
        </li>
      {/each}
    </ul>

    <p class="text-sm leading-relaxed text-muted-foreground">They can't sign in, and never show up in social, search, payments or your client count. They stay in Practice view until you remove them from Clients.</p>

    {#if sandbox.error}<p class="text-sm text-destructive" role="alert">{sandbox.error}</p>{/if}

    <Dialog.Footer class="flex-wrap gap-2 sm:justify-start">
      <Button disabled={sandbox.busy} onclick={useSamples}>{sandbox.busy ? "Adding sample clients…" : "Start"}</Button>
      {#if !practice.locked}
        <Button variant="outline" disabled={sandbox.busy} onclick={() => guide.chooseStudioMode("real")}>I'll use my real clients</Button>
      {/if}
      <Button variant="ghost" disabled={sandbox.busy} onclick={() => (guide.askStudioMode = null)}>Not now</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
