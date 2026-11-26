<!-- A group anyone can find, signed out (canvas S4): what it is, upcoming events and its forum
     posts; Ask to join (or Join) opens the sign-in prompt. Never the chat, member names, the board
     or the invite code. -->
<script lang="ts">
  import Share2 from "@lucide/svelte/icons/share-2";
  import { SITE_URL } from "$lib/site";
  import ForumRow from "$lib/social/ForumRow.svelte";
  import { ask } from "$lib/social/prompt.svelte";
  import { photoUrl } from "$lib/social/publicApi";

  const { data } = $props();
  const g = $derived(data.group);
  const initials = $derived(g.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join(""));
  const facts = $derived([g.kind, g.place, `${g.members} ${g.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · "));
  const day = (ms: number) => new Date(ms);
  const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => day(ms).toLocaleString("en-IE", { ...o, timeZone: "Europe/Dublin" });
  let copied = $state(false);
  async function share() {
    const url = `${SITE_URL}${g.webPath}`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: g.name, url });
      else { await navigator.clipboard.writeText(url); copied = true; setTimeout(() => (copied = false), 2000); }
    } catch {
      // Cancelled.
    }
  }
</script>

<svelte:head>
  <title>{g.name} · LogIt</title>
  <meta name="description" content="{g.name}: {facts}. Sessions, meets and posts on LogIt." />
  <link rel="canonical" href="{SITE_URL}{g.webPath}" />
  <meta property="og:title" content={g.name} />
  <meta property="og:description" content={facts} />
</svelte:head>

<div class="flex flex-col gap-4 border-b border-border px-4 py-5 sm:px-5">
  <div class="flex items-center gap-4">
    <span class="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-2xl font-bold text-heading">{#if photoUrl(data.api, g.photoUrl)}<img src={photoUrl(data.api, g.photoUrl)} alt="" class="size-full object-cover" />{:else}{initials}{/if}</span>
    <span class="flex min-w-0 flex-col gap-0.5"><h1 class="text-2xl font-bold leading-tight text-heading">{g.name}</h1><span class="text-sm text-muted-foreground">{facts} · {g.access === "Open" ? "Open to join" : "Ask to join"}</span></span>
  </div>
  {#if data.organiser}<p class="text-[15px] leading-snug">Run by {data.organiser}. Members chat, plan sessions and meets, and post in the group.</p>{/if}
  <div class="grid grid-cols-2 gap-2">
    <button type="button" class="flex h-11 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90" onclick={() => ask("join", g.name)}>{g.access === "Open" ? "Join in LogIt" : "Ask to join in LogIt"}</button>
    <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-full border border-border font-semibold hover:bg-muted" onclick={share}><Share2 class="size-4" />{copied ? "Link copied" : "Share"}</button>
  </div>
</div>

{#if data.events.length}
  <section class="border-b border-border px-4 pb-2 pt-4 sm:px-5" aria-labelledby="upcoming">
    <h2 id="upcoming" class="text-lg font-bold text-heading">Upcoming</h2>
    {#each data.events as e (e.id)}
      <div class="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
        <span class="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted"><span class="text-[10px] uppercase text-muted-foreground">{fmt(e.startsAtMs, { weekday: "short" })}</span><span class="text-lg font-bold leading-none text-heading">{fmt(e.startsAtMs, { day: "numeric" })}</span></span>
        <span class="flex min-w-0 flex-col"><span class="font-semibold text-heading">{e.title}</span><span class="text-sm text-muted-foreground">{[fmt(e.startsAtMs, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), e.place, e.going ? `${e.going} going` : null].filter(Boolean).join(" · ")}</span></span>
      </div>
    {/each}
  </section>
{/if}

<h2 class="px-4 pb-1 pt-4 text-lg font-bold text-heading sm:px-5">Posts</h2>
{#if data.posts.length === 0}
  <p class="px-6 py-10 text-center text-sm text-muted-foreground">No posts in this group yet.</p>
{:else}
  <div class="flex flex-col">{#each data.posts as post (post.id)}<ForumRow {post} showGroup={false} />{/each}</div>
{/if}
