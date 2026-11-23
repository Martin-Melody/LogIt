<script lang="ts">
  import { ChevronDown, MoreVertical } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { Button } from "$lib/components/ui/button";

  // The workout's header (merged design, canvas row "v2 and v3 merged"): minimise (back to
  // where you were; the pill above the nav brings you back), the day's name with the time
  // and sets done, Finish, the workout menu, and a thin progress line along the bottom.
  const {
    title = "Workout",
    saving = false,
    error = null,
    startedAtMs = null,
    showActions = true,
    canFinish = false,
    loggedSetCount = 0,
    totalSetCount = 0,
    onFinish = () => {},
    onMenu = () => {},
  }: {
    title?: string;
    saving?: boolean;
    error?: string | null;
    startedAtMs?: number | null;
    /** Finish and the ⋮ menu; hidden while the workout is being finished. */
    showActions?: boolean;
    canFinish?: boolean;
    loggedSetCount?: number;
    /** Every working set planned or logged, for "4 of 15 sets" and the line. */
    totalSetCount?: number;
    onFinish?: () => void | Promise<void>;
    onMenu?: () => void;
  } = $props();

  let now = $state(Date.now());

  $effect(() => {
    if (startedAtMs == null) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const elapsedLabel = $derived.by(() => {
    if (startedAtMs == null) return null;
    const total = Math.max(0, Math.floor((now - startedAtMs) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  });

  const sub = $derived(
    [saving ? "Saving…" : elapsedLabel, totalSetCount > 0 ? `${loggedSetCount} of ${totalSetCount} sets` : null].filter(Boolean).join(" · "),
  );
  const pct = $derived(totalSetCount > 0 ? Math.min(100, (loggedSetCount / totalSetCount) * 100) : 0);
</script>

<!-- In the shared header (same place as every other page's), without the bell while training. -->
<PageHeader bell={false}>
  <button
    type="button"
    class="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
    aria-label="Minimise workout"
    onclick={() => back("/")}
  >
    <ChevronDown class="h-5 w-5" />
  </button>

  <div class="flex min-w-0 flex-1 flex-col">
    <h1 class="truncate text-base font-semibold leading-tight">{title}</h1>
    {#if sub}<span class="truncate text-xs text-muted-foreground tabular-nums" aria-label="Workout time and sets">{sub}</span>{/if}
  </div>

  {#if showActions}
    <Button
      size="sm"
      class="ml-1 h-10 shrink-0 rounded-full px-4 font-semibold"
      aria-label="Finish workout"
      data-guide="session-finish"
      disabled={!canFinish || saving}
      onclick={() => void onFinish()}
    >
      Finish
    </Button>

    <button
      type="button"
      class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
      aria-label="Workout options"
      onclick={onMenu}
    >
      <MoreVertical class="h-5 w-5" />
    </button>
  {/if}

  {#if totalSetCount > 0}
    <div class="pointer-events-none absolute inset-x-0 -bottom-px h-[3px] bg-muted" role="progressbar" aria-label="Sets done"
      aria-valuemin={0} aria-valuemax={totalSetCount} aria-valuenow={loggedSetCount}>
      <div class="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style="width: {pct}%"></div>
    </div>
  {/if}
</PageHeader>

{#if error}
  <p class="px-3 py-1.5 text-sm text-destructive border-b border-border">{error}</p>
{/if}
