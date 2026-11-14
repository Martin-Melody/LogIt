<script lang="ts">
  import Logo from "@logit/ui/Logo.svelte";
  import Menu from "@lucide/svelte/icons/menu";
  import X from "@lucide/svelte/icons/x";
  import { page } from "$app/state";
  import { DASHBOARD_URL, PLAY_URL } from "$lib/site";

  const links = [
    { href: "/#features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/open-source", label: "Open source" },
    { href: "/docs", label: "Docs" },
  ];

  let open = $state(false);
  const current = (href: string) =>
    !href.includes("#") && (page.url.pathname === href || page.url.pathname.startsWith(href + "/"));
</script>

<header class="relative z-20 px-4 sm:px-6">
  <nav aria-label="Main" class="mx-auto flex max-w-[1160px] items-center justify-between gap-4 py-5">
    <a href="/" class="flex items-center gap-2.5 text-[19px] font-semibold text-foreground">
      <Logo size={28} />
      LogIt
    </a>

    <div class="hidden items-center gap-7 text-sm md:flex">
      {#each links as link (link.href)}
        <a
          href={link.href}
          aria-current={current(link.href) ? "page" : undefined}
          class="transition-colors hover:text-foreground {current(link.href) ? 'text-foreground' : 'text-muted-foreground'}"
        >{link.label}</a>
      {/each}
    </div>

    <div class="hidden items-center gap-2 text-sm md:flex">
      <a href={DASHBOARD_URL} class="px-3 py-2 text-foreground hover:text-heading">Sign in</a>
      <a href={PLAY_URL} class="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90">Get the app</a>
    </div>

    <button
      type="button"
      class="-mr-2 inline-flex size-11 items-center justify-center rounded-lg text-foreground md:hidden"
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? "Close menu" : "Open menu"}
      onclick={() => (open = !open)}
    >
      {#if open}<X class="size-5" />{:else}<Menu class="size-5" />{/if}
    </button>
  </nav>

  {#if open}
    <div id="mobile-menu" class="mx-auto mb-4 flex max-w-[1160px] flex-col rounded-xl border border-border bg-card p-2 md:hidden">
      {#each links as link (link.href)}
        <a href={link.href} class="rounded-lg px-3 py-3 text-foreground hover:bg-accent" onclick={() => (open = false)}>{link.label}</a>
      {/each}
      <a href={DASHBOARD_URL} class="rounded-lg px-3 py-3 text-foreground hover:bg-accent">Sign in</a>
      <a href={PLAY_URL} class="mt-1 rounded-lg bg-primary px-3 py-3 text-center font-semibold text-primary-foreground">Get the app</a>
    </div>
  {/if}
</header>
