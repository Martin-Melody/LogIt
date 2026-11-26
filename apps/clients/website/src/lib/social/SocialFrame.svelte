<!-- Social on getlogit.app, signed out (design canvas row 20): the same Social as signed in, like X
     and Facebook. Wide: Explore, Forum, Search and Groups on the left; New to LogIt?, Trending and
     People to follow on the right; a join bar along the bottom. Phone (S6): a header with Search
     and Log in, Explore | Forum | Groups, and Open in the app at the bottom. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import Logo from "@logit/ui/Logo.svelte";
  import Compass from "@lucide/svelte/icons/compass";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import Search from "@lucide/svelte/icons/search";
  import Users from "@lucide/svelte/icons/users";
  import { PLAY_URL } from "$lib/site";
  import { ask, logIn, signUp } from "./prompt.svelte";
  import { photoUrl } from "./publicApi";
  import SignInPrompt from "./SignInPrompt.svelte";

  type Rail = { trending: { tag: string; count: number }[]; people: { username: string; displayName: string; avatarUrl: string | null; bio: string | null }[] };
  const { rail, api, children }: { rail: Rail; api: string; children: Snippet } = $props();

  const nav = [
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/forum", label: "Forum", icon: MessagesSquare },
    { href: "/search", label: "Search", icon: Search },
    { href: "/groups", label: "Groups", icon: Users },
  ];
  const tabs = nav.filter((n) => n.href !== "/search");
  const path = $derived(page.url.pathname);
  const active = (href: string) => path === href || path.startsWith(href + "/");
  // Where Log in lands in the web app: the page says (its own post, tag or group), else Social.
  const appPath = $derived((page.data as { appPath?: string }).appPath ?? "/social");
  // Opens this page in LogIt when it's installed (App Links), else Google Play.
  const openInApp = $derived(`intent://getlogit.app${path}#Intent;scheme=https;package=ie.logit.app;S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`);
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
  <!-- Phone header and tabs (S6) -->
  <header class="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:hidden">
    <div class="flex items-center gap-1 py-2 pl-4 pr-2">
      <a href="/" class="flex flex-1 items-center gap-2 text-[19px] font-bold text-heading"><Logo size={26} />LogIt</a>
      <a href="/search" aria-label="Search" class="flex size-11 items-center justify-center rounded-full text-foreground"><Search class="size-5" /></a>
      <a href={logIn(appPath)} class="flex h-9 items-center rounded-full border border-border px-4 text-sm font-semibold">Log in</a>
    </div>
    <nav aria-label="Social" class="flex">
      {#each tabs as t (t.href)}
        <a href={t.href} aria-current={active(t.href) ? "page" : undefined}
          class="flex h-11 flex-1 items-center justify-center text-sm {active(t.href) ? 'border-b-2 border-heading font-semibold text-heading' : 'text-muted-foreground'}">{t.label}</a>
      {/each}
    </nav>
  </header>

  <div class="mx-auto flex w-full max-w-[1200px] flex-1 justify-center">
    <!-- Left menu -->
    <nav aria-label="Social" class="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col gap-1 border-r border-border px-4 py-5 lg:flex">
      <a href="/" class="mb-4 flex items-center gap-2.5 px-3 text-[21px] font-bold text-heading"><Logo size={28} />LogIt</a>
      {#each nav as n (n.href)}
        <a href={n.href} aria-current={active(n.href) ? "page" : undefined}
          class="flex h-12 items-center gap-3.5 rounded-full px-4 text-[17px] transition-colors hover:bg-muted {active(n.href) ? 'bg-muted font-bold text-heading' : 'text-foreground'}">
          <n.icon class="size-[22px]" />{n.label}
        </a>
      {/each}
      <a href={signUp(appPath)} class="mt-4 flex h-11 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90">Sign up</a>
    </nav>

    <main id="main" class="w-full max-w-[620px] min-w-0 pb-28 lg:border-r lg:border-border">
      {@render children()}
    </main>

    <!-- Right column -->
    <aside class="sticky top-0 hidden h-screen w-[320px] shrink-0 flex-col gap-4 overflow-y-auto px-5 pb-28 pt-5 xl:flex">
      <section class="flex flex-col gap-2.5 rounded-2xl border border-border p-4">
        <h2 class="text-lg font-bold text-heading">New to LogIt?</h2>
        <p class="text-sm leading-snug text-muted-foreground">Track your training, follow people who lift and run, and ask the Forum. Free.</p>
        <a href={signUp(appPath)} class="flex h-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">Create an account</a>
        <a href={PLAY_URL} class="flex h-10 items-center justify-center rounded-full border border-border text-sm font-semibold hover:bg-muted">Get the app</a>
      </section>
      {#if rail.trending.length}
        <section class="flex flex-col rounded-2xl border border-border px-4 pb-2 pt-3">
          <h2 class="pb-1 text-lg font-bold text-heading">Trending</h2>
          {#each rail.trending as t (t.tag)}
            <a href="/t/{encodeURIComponent(t.tag)}" class="flex flex-col border-b border-border py-2.5 last:border-b-0 hover:bg-muted/40">
              <span class="font-semibold text-sky-300">#{t.tag}</span><span class="text-xs text-muted-foreground">{t.count} {t.count === 1 ? "post" : "posts"}</span>
            </a>
          {/each}
        </section>
      {/if}
      {#if rail.people.length}
        <section class="flex flex-col gap-1 rounded-2xl border border-border px-4 pb-3 pt-3">
          <h2 class="pb-1 text-lg font-bold text-heading">People to follow</h2>
          {#each rail.people as p (p.username)}
            <div class="flex items-center gap-2.5 py-1.5">
              <a href="/@{p.username}" class="flex min-w-0 flex-1 items-center gap-2.5">
                <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold">{#if photoUrl(api, p.avatarUrl)}<img src={photoUrl(api, p.avatarUrl)} alt="" class="size-full object-cover" />{:else}{(p.displayName || p.username).charAt(0).toUpperCase()}{/if}</span>
                <span class="flex min-w-0 flex-col"><span class="truncate text-sm font-semibold text-heading">{p.displayName || p.username}</span><span class="truncate text-xs text-muted-foreground">@{p.username}</span></span>
              </a>
              <button type="button" class="h-8 rounded-full border border-border px-3.5 text-sm font-semibold hover:bg-muted" onclick={() => ask("follow", p.displayName || p.username)}>Follow</button>
            </div>
          {/each}
        </section>
      {/if}
      <p class="px-1 text-xs text-muted-foreground"><a href="/" class="hover:text-foreground">About LogIt</a> · <a href="/privacy" class="hover:text-foreground">Privacy</a> · <a href="/terms" class="hover:text-foreground">Terms</a> · <a href="/docs" class="hover:text-foreground">Docs</a></p>
    </aside>
  </div>

  <!-- The join bar (wide) and Open in the app (phone) -->
  <div class="fixed inset-x-0 bottom-0 z-30 hidden bg-primary py-3 text-primary-foreground lg:block">
    <div class="mx-auto flex max-w-[820px] items-center gap-4 px-6">
      <span class="flex flex-1 flex-col"><span class="text-lg font-bold">See what people are training</span><span class="text-sm">People on LogIt see it first.</span></span>
      <a href={logIn(appPath)} class="flex h-9 items-center rounded-full border border-primary-foreground/60 px-4 text-sm font-semibold">Log in</a>
      <a href={signUp(appPath)} class="flex h-9 items-center rounded-full bg-primary-foreground px-4 text-sm font-semibold text-primary">Sign up</a>
    </div>
  </div>
  <div class="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
    <a href={openInApp} class="flex h-11 flex-1 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">Open in the app</a>
    <a href={signUp(appPath)} class="flex h-11 items-center rounded-full border border-border px-5 font-semibold">Sign up</a>
  </div>
</div>

<SignInPrompt {appPath} />
