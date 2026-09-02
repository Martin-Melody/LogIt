<script lang="ts">
  import { page } from "$app/stores";
  import { docsNav } from "$lib/docs/nav";

  let { children } = $props();
  let mobileOpen = $state(false);
</script>

<div class="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8 md:py-12">
  <!-- Sidebar -->
  <aside class="hidden w-52 shrink-0 md:block">
    <nav class="sticky top-8 flex flex-col gap-6 text-sm">
      {#each docsNav as section (section.title)}
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          <ul class="flex flex-col gap-0.5">
            {#each section.links as link (link.href)}
              <li>
                <a
                  href={link.href}
                  class="block rounded px-2 py-1 {$page.url.pathname === link.href
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                >
                  {link.title}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>
  </aside>

  <!-- Mobile section switcher -->
  <div class="md:hidden">
    <button
      type="button"
      class="mb-4 rounded border border-border px-3 py-1.5 text-sm"
      onclick={() => (mobileOpen = !mobileOpen)}
    >
      {mobileOpen ? "Hide" : "Docs menu"}
    </button>
    {#if mobileOpen}
      <nav class="mb-6 flex flex-col gap-4 text-sm">
        {#each docsNav as section (section.title)}
          <div>
            <p class="mb-1 text-xs font-semibold uppercase text-muted-foreground">{section.title}</p>
            {#each section.links as link (link.href)}
              <a href={link.href} class="block py-1 text-muted-foreground" onclick={() => (mobileOpen = false)}>
                {link.title}
              </a>
            {/each}
          </div>
        {/each}
      </nav>
    {/if}
  </div>

  <div class="min-w-0 flex-1">
    {@render children?.()}
  </div>
</div>
