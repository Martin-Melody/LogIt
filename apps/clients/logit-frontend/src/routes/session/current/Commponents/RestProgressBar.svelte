<script lang="ts">
  import { X } from "lucide-svelte";

  const {
    restStartedAtMs,
    restDurationMs = 90_000,
    onDone = () => {},
    onDismiss = () => {},
  } = $props<{
    restStartedAtMs: number;
    restDurationMs?: number;
    onDone?: () => void;
    onDismiss?: () => void;
  }>();

  let nowMs = $state(Date.now());
  let doneFired = $state(false);

  $effect(() => {
    const id = setInterval(() => {
      nowMs = Date.now();
    }, 500);
    return () => clearInterval(id);
  });

  const elapsed = $derived(nowMs - restStartedAtMs);
  const remaining = $derived(Math.max(0, restDurationMs - elapsed));
  const progress = $derived(Math.min(1, elapsed / restDurationMs));
  const isDone = $derived(remaining === 0);

  const minutes = $derived(Math.floor(remaining / 60_000));
  const secs = $derived(Math.floor((remaining % 60_000) / 1000));
  const label = $derived(
    isDone
      ? "Done!"
      : minutes > 0
        ? `${minutes}:${String(secs).padStart(2, "0")}`
        : `${secs}s`,
  );

  $effect(() => {
    if (isDone && !doneFired) {
      doneFired = true;
      onDone();
    }
  });
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
  <div class="flex-1 h-1 bg-muted rounded-full overflow-hidden">
    <div
      class="h-full rounded-full transition-all duration-500 {isDone
        ? 'bg-primary'
        : 'bg-primary/70'}"
      style="width: {progress * 100}%"
    ></div>
  </div>
  <span class="text-xs tabular-nums text-muted-foreground min-w-[2.5rem] text-right shrink-0">
    {label}
  </span>
  <button
    type="button"
    class="shrink-0 text-muted-foreground hover:text-foreground"
    onclick={onDismiss}
    aria-label="Dismiss rest timer"
  >
    <X class="h-3.5 w-3.5" />
  </button>
</div>
