<!-- Layout for the legal pages: a small side menu and one column of text. -->
<script lang="ts">
  import { page } from "$app/state";
  import type { Snippet } from "svelte";

  let { title, updated, children }: { title: string; updated?: string; children: Snippet } = $props();

  const links = [
    { href: "/privacy", label: "Privacy policy" },
    { href: "/terms", label: "Terms of service" },
    { href: "/delete-account", label: "Delete your account" },
  ];
</script>

<div class="mx-auto flex max-w-[1120px] flex-wrap gap-x-14 gap-y-8 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
  <aside class="min-w-0 max-w-[240px] flex-[1_1_200px]">
    <nav aria-label="Legal" class="flex flex-col gap-1 text-[15px] md:sticky md:top-6">
      <span class="px-3 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Legal</span>
      {#each links as link (link.href)}
        <a
          href={link.href}
          aria-current={page.url.pathname === link.href ? "page" : undefined}
          class="rounded-lg px-3 py-2 {page.url.pathname === link.href ? 'bg-card font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}"
        >{link.label}</a>
      {/each}
    </nav>
  </aside>
  <article class="prose-site min-w-0 max-w-[720px] flex-[999_1_560px]">
    <h1>{title}</h1>
    {#if updated}<p class="text-sm text-muted-foreground">Last updated {updated}</p>{/if}
    {@render children()}
  </article>
</div>
