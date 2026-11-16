<!-- The Guide panel (sidebar › Guide): your plan's walkthroughs as chapters, a docs search,
     and where the phone versions are. -->
<script lang="ts">
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleIcon from "@lucide/svelte/icons/circle";
  import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import type { Walkthrough } from "@logit/core/guide/types";
  import { guide, chaptersOf } from "./guide.svelte";
  import { sandbox } from "./sandbox.svelte";
  import { DOCS_BASE } from "./docs";

  let { walkthroughs }: { walkthroughs: Walkthrough[] } = $props();

  const NAMES: Record<Walkthrough, string> = { pro: "Pro walkthrough", studio: "Studio walkthrough", app: "The app" };
  let query = $state("");

  function search(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    window.open(q ? `${DOCS_BASE}/docs?q=${encodeURIComponent(q)}` : `${DOCS_BASE}/docs`, "_blank", "noopener");
  }
</script>

<Sheet.Root bind:open={guide.panelOpen}>
  <Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-md">
    <Sheet.Header>
      <Sheet.Title>Guide</Sheet.Title>
      <Sheet.Description>Short chapters on your own account. Anything you make in one is yours to keep.</Sheet.Description>
    </Sheet.Header>

    <div class="flex flex-col gap-6 px-4 pb-6">
      {#each walkthroughs as w (w)}
        {@const chapters = chaptersOf(w)}
        {@const done = guide.doneCount(w)}
        {@const next = guide.nextChapter(w)}
        <section aria-labelledby="guide-{w}">
          <div class="flex items-baseline justify-between">
            <h3 id="guide-{w}" class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{NAMES[w]}</h3>
            <span class="text-xs text-muted-foreground">{done} of {chapters.length} done</span>
          </div>
          <div class="mt-2 h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={chapters.length} aria-valuenow={done} aria-label="{NAMES[w]} progress">
            <div class="h-1.5 rounded-full bg-primary" style="width:{chapters.length ? (done / chapters.length) * 100 : 0}%"></div>
          </div>
          {#if w === "studio"}
            <p class="mt-2 text-xs text-muted-foreground">
              {#if sandbox.on}Practising on sample clients ({sandbox.clients.map((c) => c.displayName).join(", ")}).
              {:else if guide.studioMode === "real"}Using your real clients. <button type="button" class="underline underline-offset-4" onclick={() => (guide.studioMode = null)}>Use sample clients instead</button>
              {:else}You'll be asked whether to practise on sample clients first.{/if}
            </p>
          {/if}
          <ol class="mt-2">
            {#each chapters as c (c.id)}
              {@const isDone = guide.isDone(c.id)}
              {@const isNext = next?.id === c.id}
              <li class="flex items-start gap-3 border-t border-border py-3 first:border-t-0 {isNext ? '-mx-2 rounded-lg border-transparent bg-muted px-2' : ''}">
                {#if isDone}<CircleCheckIcon class="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                {:else if isNext}<CircleDotIcon class="mt-0.5 size-5 shrink-0" aria-label="Next" />
                {:else}<CircleIcon class="mt-0.5 size-5 shrink-0 text-muted-foreground/60" aria-label="Not started" />{/if}
                <div class="min-w-0 flex-1">
                  <div class="text-sm {isNext ? 'font-semibold' : 'font-medium'}">{c.title}</div>
                  <div class="text-xs text-muted-foreground">{c.blurb} · {c.minutes} min</div>
                </div>
                <Button size="sm" variant={isNext ? "default" : "outline"} class="h-8" onclick={() => guide.start(c.id)}>
                  {isDone ? "Replay" : guide.progress.resume?.chapter === c.id ? "Continue" : "Start"}
                </Button>
              </li>
            {/each}
          </ol>
        </section>
      {/each}

      <form class="flex flex-col gap-2 border-t border-border pt-4" onsubmit={search}>
        <label for="guide-docsearch" class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Search the docs</label>
        <input id="guide-docsearch" type="search" bind:value={query} placeholder="e.g. give a client a program"
          class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        <p class="text-xs text-muted-foreground">On your phone: Settings › Walkthroughs has the short versions. Ticks are shared.</p>
      </form>
    </div>
  </Sheet.Content>
</Sheet.Root>
