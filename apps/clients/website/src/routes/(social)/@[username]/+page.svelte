<!-- A public profile, signed out (design canvas W1, W3, F5): the profile, the latest posts and
     forum posts, then Sign in. Follow and Open in LogIt go to the app (or the web app). -->
<script lang="ts">
  import { DASHBOARD_URL, PLAY_URL, SITE_URL } from "$lib/site";
  import CoachingSection from "@logit/ui/CoachingSection.svelte";
  import { ask, logIn } from "$lib/social/prompt.svelte";
  import ProfileHead from "$lib/social/ProfileHead.svelte";
  import PublicPost from "$lib/social/PublicPost.svelte";
  import ForumRow from "$lib/social/ForumRow.svelte";
  import TrainingCards from "$lib/social/TrainingCards.svelte";
  import { shownCards, parseProfileData } from "@logit/core/domain/profileCards";

  const { data } = $props();
  const p = $derived(data.profile);
  // Canvas L1: a working link opens asking with it (so the coach knows where people came from),
  // or straight to paying for a pay-and-start link. Anything else is the plain profile.
  const linkAsk = $derived.by(() => {
    const plain = { href: `${DASHBOARD_URL}/ask/${encodeURIComponent(p.username)}`, label: null as string | null };
    const l = data.link;
    if (!l || l.state !== "active") return plain;
    if (l.pays) {
      const price = new Intl.NumberFormat(undefined, { style: "currency", currency: l.pays.currency.toUpperCase(), maximumFractionDigits: 0 }).format(l.pays.amountCents / 100);
      return { href: `${DASHBOARD_URL}/c/${encodeURIComponent(l.code)}`, label: `Start coaching · ${price}${l.pays.interval === "month" ? " a month" : ""}` };
    }
    return { href: `${plain.href}?l=${encodeURIComponent(l.code)}`, label: null };
  });
  // Posts | Training tabs, as in the app (the page's 620 px column has no room for a side column).
  let view = $state<"posts" | "training">("posts");
  const hasCards = $derived(shownCards(parseProfileData(p.publicProfileJson)).length > 0);
  const description = $derived((p.coaching?.headline ? `${p.coaching.headline}. ${p.bio ?? ""}` : p.bio || `${p.displayName} trains with LogIt.`).replace(/\s+/g, " ").trim().slice(0, 155));
</script>

<svelte:head>
  <title>{p.displayName} (@{p.username}) · LogIt</title>
  <!-- A page with nothing on it counts against the whole site in search; the profiles sitemap skips these too. -->
  {#if data.posts.length === 0 && data.forum.length === 0 && !p.coaching}<meta name="robots" content="noindex" />{/if}
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/@{p.username}" />
  <meta property="og:title" content="{p.displayName} (@{p.username})" />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="profile" />
</svelte:head>

<div class="flex flex-col gap-4 px-4 pb-10 pt-6 sm:px-5">
  <ProfileHead profile={p} api={data.api} />
  <div class="grid grid-cols-2 gap-2">
    <button type="button" class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90" onclick={() => ask("follow", p.displayName)}>Follow</button>
    <a href="logit://u/{p.username}" class="rounded-lg border border-border px-4 py-3 text-center font-semibold hover:bg-muted">Open in the app</a>
  </div>
  {#if p.coaching}
    <!-- Canvas P1: what a coach offers, and Ask to be coached (on the web app, where the ask happens). -->
    <CoachingSection section={p.coaching} name={p.displayName} class="rounded-2xl border border-border p-4"
      askHref={linkAsk.href} askLabel={linkAsk.label} />
  {/if}
  <!-- Design canvas PR5: the same Training cards as the app. Both tabs are in the page for search engines. -->
  {#if hasCards}
    <div role="tablist" aria-label="@{p.username}" class="flex border-b border-border">
      {#each [["posts", "Posts"], ["training", "Training"]] as [v, label] (v)}
        <button type="button" role="tab" aria-selected={view === v} onclick={() => (view = v as typeof view)}
          class="-mb-px h-11 flex-1 border-b-2 text-sm {view === v ? 'border-foreground font-semibold text-heading' : 'border-transparent text-muted-foreground'}">{label}</button>
      {/each}
    </div>
  {/if}
  <div class="flex flex-col">
    <div class="flex min-w-0 flex-col gap-4 {view === 'training' ? 'hidden' : ''}">
    {#if data.posts.length === 0 && data.forum.length === 0}
      <p class="py-10 text-center text-sm text-muted-foreground">No posts yet.</p>
    {:else if data.posts.length}
      <div class="flex flex-col">
        {#each data.posts as post (post.id)}<PublicPost {post} api={data.api} href="/@{p.username}/p/{post.id}" />{/each}
      </div>
    {/if}
    {#if data.forum.length}
      <h2 class="mt-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Forum</h2>
      <div class="-mx-4 flex flex-col sm:-mx-5">{#each data.forum as post (post.id)}<ForumRow {post} />{/each}</div>
    {/if}
    </div>
    {#if hasCards}
      <aside aria-label="Training" class="flex flex-col gap-3 {view === 'posts' ? 'hidden' : ''}">
        <h2 class="sr-only">Training</h2>
        <TrainingCards json={p.publicProfileJson ?? null} api={data.api} name={p.displayName} />
      </aside>
    {/if}
  </div>
  <div class="mt-2 flex flex-col gap-3 rounded-2xl border border-border p-5 sm:flex-row sm:items-center">
    <p class="flex-1 text-sm text-muted-foreground">Sign in to see more of {p.displayName}'s posts, like and comment. Any LogIt account works, and it's free.</p>
    <span class="flex gap-2">
      <a href={logIn(data.appPath)} class="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Sign in</a>
      <a href={PLAY_URL} class="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Get the app</a>
    </span>
  </div>
</div>
