<script lang="ts">
  import { Flame } from "lucide-svelte";

  // The streak, drawn the same wherever it shows (Home, Sessions): a small amber flame and
  // "10-week streak" (DESIGN.md › Do's and Don'ts). Never "0-week streak".
  const { weeks }: { weeks: number } = $props();
</script>

<span class="flex items-center gap-1.5 text-[13px] font-medium tabular-nums">
  <Flame class="h-4 w-4 {weeks > 0 ? 'text-warning' : 'text-muted-foreground'}" aria-hidden="true" />
  {weeks > 0 ? `${weeks}-week streak` : "No streak yet"}
</span>
