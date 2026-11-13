<script lang="ts">
  import "./layout.css";
  import SiteHeader from "$lib/site/SiteHeader.svelte";
  import SiteFooter from "$lib/site/SiteFooter.svelte";
  import { page } from "$app/state";
  import { SITE_URL } from "$lib/site";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="canonical" href="{SITE_URL}{page.url.pathname === '/' ? '' : page.url.pathname}" />
  <meta property="og:site_name" content="LogIt" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="{SITE_URL}/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to content</a>

<div class="flex min-h-screen flex-col bg-background text-foreground">
  <SiteHeader />
  <main id="main" class="flex-1">
    {@render children?.()}
  </main>
  <SiteFooter />
</div>
