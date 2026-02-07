<script lang="ts">
  import { page } from "$app/stores";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { House, List, SquareChartGantt } from "@lucide/svelte";
  import { ChartNoAxesColumn, User } from "lucide-svelte";

  const isActive = (href: string) => $page.url.pathname === href;
</script>

{#if !$keyboard.visible}
  <ul class="flex w-full justify-around">
    <li>
      <a
        href="/sessions"
        class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
        class:text-primary={isActive("/sessions")}
        class:text-muted-foreground={!isActive("/sessions")}
        aria-current={isActive("/sessions") ? "page" : undefined}
      >
        <List size={22} strokeWidth={isActive("/log") ? 2.5 : 2} />
        <span>Sessions</span>
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
        <SquareChartGantt
          size={22}
          strokeWidth={isActive("/splits") ? 2.5 : 2}
        />
        <span>Splits</span>
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
        href="/progress"
        class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
        class:text-primary={isActive("/progress")}
        class:text-muted-foreground={!isActive("/progress")}
        aria-current={isActive("/progress") ? "page" : undefined}
      >
        <ChartNoAxesColumn
          size={22}
          strokeWidth={isActive("/progress") ? 2.5 : 2}
        />
        <span>Progress</span>
      </a>
    </li>

    <li>
      <a
        href="/profile"
        class="flex min-w-[64px] flex-col items-center gap-1 py-2 text-xs transition-colors"
        class:text-primary={isActive("/profile")}
        class:text-muted-foreground={!isActive("/profile")}
        aria-current={isActive("/profille") ? "page" : undefined}
      >
        <User size={22} strokeWidth={isActive("/profile") ? 2.5 : 2} />
        <span>Profile</span>
      </a>
    </li>
  </ul>
{/if}
