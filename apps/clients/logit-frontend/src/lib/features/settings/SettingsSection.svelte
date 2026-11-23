<!-- A group of settings: an optional small heading, the rows in one card, an optional note. -->
<script lang="ts" module>
  /** One setting in a SettingsSection. */
  export const settingRow = "flex min-h-14 items-center gap-3 px-3 py-2.5 scroll-mt-4";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  const { title, note, id, children }: { title?: string; note?: string; id?: string; children: Snippet } = $props();
</script>

<section {id} class="scroll-mt-4">
  {#if title}
    <h2 class="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
  {/if}
  <div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
    {@render children()}
  </div>
  {#if note}
    <p class="px-1 pt-2 text-[13px] leading-snug text-muted-foreground">{note}</p>
  {/if}
</section>
