<script lang="ts">
  import { page } from "$app/stores";
  import { Dumbbell, House, SquareChartGantt } from "@lucide/svelte";

  const isActive = (href: string) => $page.url.pathname === href;
</script>

<ul class="flex w-full justify-around">
  <li>
    <a
      href="/log"
      class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
      class:text-primary={isActive("/log")}
      class:text-muted-foreground={!isActive("/log")}
      aria-current={isActive("/log") ? "page" : undefined}
    >
      <Dumbbell size={22} strokeWidth={isActive("/log") ? 2.5 : 2} />
      <span>Log</span>
    </a>
  </li>

  <li>
    <a
      href="/"
      class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
      class:text-primary={isActive("/")}
      class:text-muted-foreground={!isActive("/")}
      aria-current={isActive("/") ? "page" : undefined}
    >
      <House size={22} strokeWidth={isActive("/") ? 2.5 : 2} />
      <span>Home</span>
    </a>
  </li>

  <li>
    <a
      href="/splits"
      class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
      class:text-primary={isActive("/splits")}
      class:text-muted-foreground={!isActive("/splits")}
      aria-current={isActive("/splits") ? "page" : undefined}
    >
      <SquareChartGantt size={22} strokeWidth={isActive("/splits") ? 2.5 : 2} />
      <span>Splits</span>
    </a>
  </li>
</ul>
