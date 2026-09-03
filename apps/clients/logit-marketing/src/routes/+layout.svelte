<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <header class="border-b border-border px-4 py-3 flex items-center justify-between">
    <a href="/" class="text-sm font-semibold">LogIt</a>
    <nav class="flex items-center gap-4 text-sm text-muted-foreground">
      <a href="/pricing" class="hover:text-foreground">Pricing</a>
    </nav>
  </header>
  <main class="flex-1">
    {@render children?.()}
  </main>
  <footer class="border-t border-border px-4 py-3 text-xs text-muted-foreground text-center flex flex-col gap-1 sm:flex-row sm:justify-center sm:gap-4">
    <span>LogIt is open source. Self-hosting is always free.</span>
    <span class="flex justify-center gap-4">
      <a href="/privacy" class="hover:text-foreground">Privacy</a>
      <a href="/terms" class="hover:text-foreground">Terms</a>
    </span>
  </footer>
</div>
