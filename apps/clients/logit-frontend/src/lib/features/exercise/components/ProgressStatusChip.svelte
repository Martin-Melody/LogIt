<script lang="ts">
  import { TrendingUp, TrendingDown, Minus, Sparkle, PauseCircle } from "lucide-svelte";
  import type { ProgressStatus } from "@logit/core/domain/progression";

  const { status } = $props<{ status: ProgressStatus }>();

  const meta: Record<ProgressStatus, { label: string; class: string; icon: typeof Minus }> = {
    progressing: { label: "Progressing", class: "text-success border-success/40 bg-success/10", icon: TrendingUp },
    plateaued:   { label: "Plateaued",   class: "text-warning border-warning/40 bg-warning/10",       icon: PauseCircle },
    regressing:  { label: "Regressing",  class: "text-destructive border-destructive/40 bg-destructive/10",           icon: TrendingDown },
    detraining:  { label: "Detraining",  class: "text-info border-info/40 bg-info/10",               icon: Minus },
    new:         { label: "New",         class: "text-muted-foreground border-border bg-muted/40",                              icon: Sparkle },
  };

  const m = $derived(meta[status as ProgressStatus]);
  const Icon = $derived(m.icon);
</script>

<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {m.class}">
  <Icon class="h-3 w-3" />
  {m.label}
</span>
