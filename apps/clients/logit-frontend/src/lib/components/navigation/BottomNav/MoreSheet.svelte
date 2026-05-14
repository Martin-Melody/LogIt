<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authStore } from "$lib/api/authStore.svelte";
  import { navConfig, NAV_ITEM_DEFS } from "$lib/stores/navConfig.store";

  const { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const items = $derived(
    $navConfig.more
      .map((id) => NAV_ITEM_DEFS.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> =>
        !!d && (!d.authRequired || authStore.isAuthenticated)
      )
  );

  function navigate(href: string) {
    onclose();
    void goto(href);
  }

  function isActive(href: string) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + "/");
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-40 bg-black/40"
    role="presentation"
    onclick={onclose}
  ></div>

  <div class="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
    <!-- Handle -->
    <div class="flex justify-center pt-2.5 pb-1">
      <div class="h-1 w-10 rounded-full bg-muted-foreground/20"></div>
    </div>

    <p class="px-4 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      More
    </p>

    <div class="grid grid-cols-3 gap-px px-3 pb-5">
      {#each items as { href, icon: Icon, label }}
        <button
          type="button"
          class="flex flex-col items-center gap-2 rounded-lg px-2 py-4 transition-colors hover:bg-muted/50 {isActive(href) ? 'text-primary' : 'text-foreground'}"
          onclick={() => navigate(href)}
        >
          <Icon size={24} strokeWidth={isActive(href) ? 2.5 : 1.75} />
          <span class="text-xs {isActive(href) ? 'text-primary' : 'text-muted-foreground'}">{label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
