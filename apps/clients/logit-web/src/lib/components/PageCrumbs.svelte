<!-- Where you are on a deep dashboard page (canvas board 6): every level is a link, the last is
     this page. Dashboard only; the phone keeps back = previous screen. -->
<script lang="ts" module>
  export type Crumb = { label: string; href?: string; /** A client: hovering shows their card. */ clientId?: string };
</script>

<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import ClientHoverCard from "$lib/features/coaching/ClientHoverCard.svelte";

  let { crumbs, class: className = "" }: { crumbs: Crumb[]; class?: string } = $props();
</script>

<Breadcrumb.Root class={className}>
  <Breadcrumb.List class="text-[13px]">
    {#each crumbs as c, i (i)}
      {#if i > 0}<Breadcrumb.Separator />{/if}
      <Breadcrumb.Item class="min-w-0">
        {#if i === crumbs.length - 1 || !c.href}
          <Breadcrumb.Page class="truncate">{c.label}</Breadcrumb.Page>
        {:else if c.clientId}
          <ClientHoverCard clientId={c.clientId} class="transition-colors hover:text-foreground">{c.label}</ClientHoverCard>
        {:else}
          <Breadcrumb.Link href={c.href}>{c.label}</Breadcrumb.Link>
        {/if}
      </Breadcrumb.Item>
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
