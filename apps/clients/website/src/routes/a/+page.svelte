<!-- A shared progression algorithm: getlogit.app/a#logit-alg1:… The code stays after the #, so it
     never reaches a server; this page reads it in the browser, shows the blocks and opens LogIt. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { parseRecipeShareCode, recipeBlockLines, type SharedRecipe } from "@logit/core/domain/progressionRecipe";
  import { PLAY_URL } from "$lib/site";

  let recipe = $state<SharedRecipe | null>(null);
  let code = $state("");
  let ready = $state(false);
  let android = $state(false);
  let copied = $state(false);

  function read() {
    const hash = decodeURIComponent(location.hash.slice(1));
    recipe = parseRecipeShareCode(hash);
    code = recipe ? (hash.match(/logit-alg1:[A-Za-z0-9_-]+/)?.[0] ?? "") : "";
    copied = false;
  }

  onMount(() => {
    android = /android/i.test(navigator.userAgent);
    read();
    ready = true;
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  });

  // Opens the app at Add from a code; Chrome goes to the Play Store when LogIt isn't installed.
  const openUrl = $derived(
    `intent://a?c=${code}#Intent;scheme=logit;package=ie.logit.app;S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head>
  <title>{recipe ? `${recipe.name} · ` : ""}A shared algorithm · LogIt</title>
  <meta name="robots" content="noindex" />
  <meta name="description" content="A progression algorithm someone built in LogIt and shared with you." />
</svelte:head>

<div class="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
  {#if !ready}
    <p class="text-muted-foreground">Loading…</p>
  {:else if !recipe}
    <h1 class="text-2xl font-bold text-heading">This link is incomplete</h1>
    <p class="text-muted-foreground">
      The algorithm is carried in the link itself, so the whole link is needed. Ask whoever sent it to send it
      again, or paste their message into LogIt under Settings › Progression › Add from a code.
    </p>
  {:else}
    <div>
      <p class="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">A progression algorithm</p>
      <h1 class="mt-1 text-3xl font-bold text-heading">{recipe.name}</h1>
      <p class="mt-2 text-muted-foreground">
        Someone built this in LogIt and shared it with you. It plans each set's weight and reps from your own history.
      </p>
    </div>

    <dl class="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-5 text-[15px]">
      {#each recipeBlockLines(recipe) as [label, value] (label)}
        <div class="flex gap-3">
          <dt class="w-32 shrink-0 text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      {/each}
    </dl>

    {#if android}
      <a href={openUrl} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">
        Open in LogIt
      </a>
      <p class="text-sm text-muted-foreground">
        You'll see it in LogIt before it's added, as your own copy. No LogIt yet? The button takes you to Google Play.
      </p>
    {:else}
      <p class="text-muted-foreground">
        Open this link on your Android phone to add it, or copy the code and paste it into LogIt under Settings ›
        Progression › Add from a code.
      </p>
      <a href={PLAY_URL} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">
        Get LogIt
      </a>
    {/if}
    <button type="button" class="rounded-lg border border-border px-4 py-3 font-medium" onclick={() => void copy()}>
      {copied ? "Copied" : "Copy the code"}
    </button>
    <p class="text-sm text-muted-foreground">Only the settings are shared, nothing about the sender's workouts.</p>
  {/if}
</div>
