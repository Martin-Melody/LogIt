<!-- The sign-in prompt (design canvas S5): says what you were trying to do, then Create an account,
     Log in (back to the same thing in the web app) or Get the app. Escape or the backdrop closes it. -->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import X from "@lucide/svelte/icons/x";
  import { PLAY_URL } from "$lib/site";
  import { PROMPTS, logIn, prompt, signUp } from "./prompt.svelte";

  const { appPath }: { appPath: string } = $props();
  const shown = $derived(prompt.ask ? PROMPTS[prompt.ask] : null);
  const title = $derived(prompt.ask === "follow" && prompt.name ? `Follow ${prompt.name} to see their training` : prompt.ask === "join" && prompt.name ? `Join ${prompt.name}` : shown?.title ?? "");
  let card = $state<HTMLDivElement | null>(null);
  const close = () => (prompt.ask = null);
  $effect(() => {
    if (card) card.querySelector<HTMLElement>("a")?.focus();
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && prompt.ask) close(); }} />

{#if shown}
  <div transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div bind:this={card} transition:scale={{ duration: 180, start: 0.96 }} role="dialog" aria-modal="true" aria-labelledby="prompt-title"
      class="relative flex w-full max-w-[440px] flex-col gap-3.5 rounded-2xl border border-border bg-card px-7 pb-6 pt-7">
      <button type="button" aria-label="Close" class="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onclick={close}><X class="size-5" /></button>
      <h2 id="prompt-title" class="pr-8 text-2xl font-extrabold leading-tight text-heading">{title}</h2>
      <p class="text-[15px] leading-snug text-muted-foreground">{shown.text} It's free, and it tracks your training too.</p>
      <a href={signUp(appPath)} class="flex h-12 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90">Create an account</a>
      <a href={logIn(appPath)} class="flex h-12 items-center justify-center rounded-full border border-border font-semibold hover:bg-muted">Log in</a>
      <a href={PLAY_URL} class="text-center text-sm text-muted-foreground hover:text-foreground">Or get the app on Google Play</a>
    </div>
  </div>
{/if}
