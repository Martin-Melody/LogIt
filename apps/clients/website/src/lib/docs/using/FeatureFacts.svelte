<!-- Top of a docs page: plan, where to find it on the web and the phone, and "Show me in the app". -->
<script lang="ts">
  import { feature, chapterFor, showMeUrl } from "./guide";
  import PlanBadge from "./PlanBadge.svelte";

  let { id }: { id: string } = $props();
  const f = $derived(feature(id));
  const show = $derived(chapterFor(id));
</script>

<div class="not-prose mb-8 flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2 text-xs">
    <PlanBadge plan={f.plan} />
    {#if f.freeWhenCoached}<span class="rounded-full border border-border px-2.5 py-0.5 font-medium">Any plan while a Studio coach coaches you</span>{/if}
    {#if f.whereWeb}<span class="rounded-full border border-border px-2.5 py-0.5 font-medium">Web: {f.whereWeb}</span>{/if}
    {#if f.wherePhone}<span class="rounded-full border border-border px-2.5 py-0.5 font-medium">Phone: {f.wherePhone}</span>{/if}
  </div>
  <p class="text-lg leading-relaxed text-muted-foreground">{f.summary}</p>
  {#if show}
    <div class="flex flex-wrap items-center gap-3">
      <a href={showMeUrl(show)} class="inline-flex h-10 items-center rounded-[10px] bg-primary px-4 text-sm font-semibold !text-primary-foreground !no-underline">Show me in the app</a>
      <span class="text-sm text-muted-foreground">Opens the "{show.title}" chapter of the {show.walkthrough === "studio" ? "Studio" : "Pro"} walkthrough on the web dashboard</span>
    </div>
  {/if}
</div>
