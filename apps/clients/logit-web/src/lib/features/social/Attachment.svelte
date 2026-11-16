<script lang="ts">
  import { attachmentSummary } from "@logit/core/domain/sharedContent";

  // The card under a post: what's attached, in one or three lines. Links to the post page,
  // which shows all of it (and Copy to mine).
  let { type, payloadJson, href }: { type: string; payloadJson: string | null; href: string } = $props();
  const s = $derived(attachmentSummary(type, payloadJson));
</script>

{#if s}
  <a {href} class="flex flex-col gap-1 rounded-lg bg-muted/60 px-3.5 py-3 hover:bg-muted">
    <span class="text-[11px] font-semibold uppercase tracking-wide {type === 'PersonalRecord' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}">{s.label}</span>
    <span class="text-[15px] font-semibold">{s.title}</span>
    {#if s.detail}<span class="line-clamp-2 text-xs text-muted-foreground">{s.detail}</span>{/if}
  </a>
{/if}
