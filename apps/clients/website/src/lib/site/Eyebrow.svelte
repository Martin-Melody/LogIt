<script lang="ts">
  let { children, class: className = "" }: { children: import("svelte").Snippet; class?: string } = $props();
</script>

<span class="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground {className}">{@render children()}</span>
