<script>
  import { ChartColumnDecreasing, Dumbbell, House } from "lucide-svelte";
</script>

<nav
  aria-label="Bottom navigation"
  class="flex h-14 items-center justify-around"
>
  <div class="flex flex-col">
    <ul>
      <li>
        <House />
      </li>

      <li>
        <Dumbbell />
      </li>

      <li>
        <ChartColumnDecreasing />
      </li>
    </ul>
  </div>
</nav>
