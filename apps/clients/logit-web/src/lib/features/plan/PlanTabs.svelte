<script lang="ts">
  /** Splits | Programs, as links (each is its own page). */
  let { current }: { current: "splits" | "programs" } = $props();
  const tabs = [
    { id: "splits", label: "Splits", href: "/plan" },
    { id: "programs", label: "Programs", href: "/plan/programs" },
  ] as const;
</script>

<nav aria-label="Plan sections" class="flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
  {#each tabs as t (t.id)}
    <a href={t.href} aria-current={t.id === current ? "page" : undefined}
      class="flex h-[30px] items-center rounded-[7px] px-3.5 text-[13px] {t.id === current ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}">{t.label}</a>
  {/each}
</nav>
