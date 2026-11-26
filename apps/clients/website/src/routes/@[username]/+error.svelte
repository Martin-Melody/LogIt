<!-- Not on the web (design canvas W6): one page for a private account, a deleted one or a name
     nobody has, so it never says which. Search engines are told not to list it. -->
<script lang="ts">
  import { page } from "$app/state";
  import { DASHBOARD_URL, PLAY_URL } from "$lib/site";

  const name = $derived(page.params.username ?? "");
  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? "Not on the web" : "Couldn't load"} · LogIt</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex min-h-[60vh] max-w-[420px] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
  {#if missing}
    <h1 class="text-2xl font-bold text-heading">This profile isn't on the web</h1>
    <p class="text-sm text-muted-foreground">If you have LogIt, sign in to look for @{name} there.</p>
    <div class="flex w-full flex-col gap-2">
      <a href="{DASHBOARD_URL}/social/{name}" class="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Sign in</a>
      <a href={PLAY_URL} class="rounded-lg border border-border px-4 py-3 font-semibold hover:bg-muted">Get the app</a>
    </div>
  {:else}
    <h1 class="text-2xl font-bold text-heading">Couldn't load this</h1>
    <p class="text-sm text-muted-foreground">{page.error?.message ?? "Try again in a moment."}</p>
  {/if}
</div>
