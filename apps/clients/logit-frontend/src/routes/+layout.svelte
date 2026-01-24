<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import BottomNav from "$lib/components/navigation/BottomNav/BottomNav.svelte";
  import TopBar from "$lib/components/ui/TopBar/TopBar.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen flex-col bg-background text-foreground">
  <TopBar />

  <main class="flex-1 overflow-y-auto overscroll-contain">
    {@render children()}
  </main>

  <footer
    class="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
  >
    <BottomNav />
  </footer>
</div>
