<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <header class="border-b border-border px-4 py-3 flex items-center justify-between">
    <a href="/" class="text-sm font-semibold">LogIt</a>
    <nav class="flex items-center gap-4 text-sm text-muted-foreground">
      <a href="/docs" class="hover:text-foreground">Docs</a>
      <a href="/docs/plugins" class="hover:text-foreground">Plugins</a>
      <a href="/self-hosting" class="hover:text-foreground">Self-hosting</a>
      <a href="https://github.com/Martin-Melody/LogIt" class="hover:text-foreground">GitHub</a>
    </nav>
  </header>
  <main class="flex-1">
    {@render children?.()}
  </main>
</div>
