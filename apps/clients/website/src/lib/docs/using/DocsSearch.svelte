<!-- Searches the feature list and the walkthrough steps (the same words the app uses). The
     dashboard's Guide panel links here with ?q=. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { CHAPTERS } from "@logit/core/guide/walkthroughs";
  import { FEATURES } from "./guide";

  let q = $state("");
  onMount(() => {
    q = new URLSearchParams(location.search).get("q") ?? "";
  });

  type Hit = { title: string; href: string; text: string; score: number };
  const index = FEATURES.map((f) => ({
    title: f.title,
    href: f.docs,
    text: [
      f.title, f.summary, f.whereWeb, f.wherePhone, ...(f.can ?? []), ...(f.cant ?? []),
      ...CHAPTERS.filter((c) => c.feature === f.id).flatMap((c) => c.steps.map((s) => `${s.title}. ${s.body}`)),
    ].filter(Boolean).join(" "),
  }));

  const hits = $derived.by((): Hit[] => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    return index
      .map((d) => {
        const hay = d.text.toLowerCase();
        const title = d.title.toLowerCase();
        const score = words.reduce((n, w) => n + (title.includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
        const at = hay.indexOf(words.find((w) => hay.includes(w)) ?? "");
        const snippet = at < 0 ? "" : d.text.slice(Math.max(0, at - 60), at + 120).trim();
        return { ...d, text: snippet, score };
      })
      .filter((h) => h.score >= words.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });
</script>

<div class="not-prose flex flex-col gap-3">
  <label class="flex flex-col gap-1.5">
    <span class="text-sm font-semibold text-foreground">Search the docs</span>
    <input type="search" bind:value={q} placeholder="e.g. give a client a program"
      class="h-11 rounded-[10px] border border-border bg-card px-3.5 text-[15px] text-foreground" />
  </label>
  {#if q.trim()}
    {#if hits.length}
      <ul class="!m-0 flex !list-none flex-col gap-2 !p-0" aria-label="Results">
        {#each hits as h (h.href + h.title)}
          <li class="!m-0 !p-0 before:hidden"><a href={h.href} class="block rounded-xl border border-border bg-card px-4 py-3 !no-underline hover:bg-accent">
            <span class="font-semibold text-foreground">{h.title}</span>
            {#if h.text}<span class="mt-0.5 block text-sm text-muted-foreground">…{h.text}…</span>{/if}
          </a></li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">Nothing found. Try fewer or different words.</p>
    {/if}
  {/if}
</div>
