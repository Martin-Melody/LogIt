<script lang="ts">
  import { page } from "$app/state";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { docsNav } from "$lib/docs/nav";

  let { children } = $props();
  let mobileOpen = $state(false);
  const isCurrent = (href: string) => page.url.pathname === href;
</script>

<div class="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6 md:flex-row md:gap-12 md:pt-14">
  <aside class="hidden w-56 shrink-0 md:block">
    <nav aria-label="Docs" class="sticky top-6 flex flex-col gap-7 text-sm">
      {#each docsNav as section (section.title)}
        <div>
          <p class="mb-2 px-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{section.title}</p>
          <ul class="flex flex-col gap-0.5">
            {#each section.links as link (link.href)}
              <li>
                <a
                  href={link.href}
                  aria-current={isCurrent(link.href) ? "page" : undefined}
                  class="block rounded-lg px-3 py-1.5 {isCurrent(link.href) ? 'bg-card font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                >{link.title}</a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>
  </aside>

  <div class="md:hidden">
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground"
      aria-expanded={mobileOpen}
      aria-controls="docs-menu"
      onclick={() => (mobileOpen = !mobileOpen)}
    >
      Docs menu
      <ChevronDown class="size-4 transition-transform {mobileOpen ? 'rotate-180' : ''}" aria-hidden="true" />
    </button>
    {#if mobileOpen}
      <nav id="docs-menu" aria-label="Docs" class="mt-2 flex flex-col gap-4 rounded-xl border border-border bg-card p-3 text-sm">
        {#each docsNav as section (section.title)}
          <div>
            <p class="mb-1 px-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{section.title}</p>
            {#each section.links as link (link.href)}
              <a href={link.href} class="block rounded-lg px-2 py-2 {isCurrent(link.href) ? 'font-semibold text-foreground' : 'text-muted-foreground'}" onclick={() => (mobileOpen = false)}>{link.title}</a>
            {/each}
          </div>
        {/each}
      </nav>
    {/if}
  </div>

  <div class="min-w-0 max-w-[760px] flex-1">
    {@render children?.()}
  </div>
</div>
