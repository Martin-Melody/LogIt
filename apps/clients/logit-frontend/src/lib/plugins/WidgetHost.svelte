<script lang="ts">
  const { renderHtml } = $props<{ renderHtml: () => string }>();

  const html = $derived(renderHtml());
</script>

<div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
  {@html html}
</div>
