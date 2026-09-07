<script lang="ts">
  import { TrendingUp, TrendingDown, Minus, Sparkle, PauseCircle } from "lucide-svelte";
  import type { ProgressStatus } from "@logit/core/domain/progression";

  const { status } = $props<{ status: ProgressStatus }>();

  const meta: Record<ProgressStatus, { label: string; class: string; icon: typeof Minus }> = {
    progressing: { label: "Progressing", class: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10", icon: TrendingUp },
    plateaued:   { label: "Plateaued",   class: "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10",       icon: PauseCircle },
    regressing:  { label: "Regressing",  class: "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10",           icon: TrendingDown },
    detraining:  { label: "Detraining",  class: "text-sky-600 dark:text-sky-400 border-sky-500/40 bg-sky-500/10",               icon: Minus },
    new:         { label: "New",         class: "text-muted-foreground border-border bg-muted/40",                              icon: Sparkle },
  };

  const m = $derived(meta[status as ProgressStatus]);
  const Icon = $derived(m.icon);
</script>

<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {m.class}">
  <Icon class="h-3 w-3" />
  {m.label}
</span>
