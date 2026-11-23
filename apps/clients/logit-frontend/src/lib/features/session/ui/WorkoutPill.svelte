<script lang="ts">
  import { ChevronUp, Timer, Dumbbell } from "lucide-svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { fly } from "svelte/transition";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { profile } from "$lib/stores/profile.store";
  import { keyboard } from "$lib/stores/keybaord.store";
  import { overlayOpen } from "$lib/stores/overlay.store";
  import { getRunningRests, type StrengthBlockData } from "@logit/core/domain/workout";
  import { blockProgress } from "$lib/features/session/stage";
  import { motionOK } from "$lib/transitions";

  // A workout minimised (design canvas M-minimised): a pill above the nav on every other
  // screen, with the time, the rest if one is running and what's next. Tap to go back.
  let now = $state(Date.now());
  $effect(() => {
    if (!$currentSession) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const shown = $derived(
    !!$currentSession && !$currentSession.endedAtMs && !page.url.pathname.startsWith("/session") && !$keyboard.visible && !$overlayOpen,
  );
  const title = $derived($currentSession?.name?.trim() || $currentSession?.source?.dayName || "Workout");
  const clock = (ms: number) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = String(t % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  };
  const rest = $derived($currentSession ? getRunningRests($currentSession, $profile.restDefaults).sort((a, b) => b.startedAtMs - a.startedAtMs)[0] ?? null : null);
  const totals = $derived(
    ($currentSession?.blocks ?? []).map(blockProgress).reduce((a, p) => ({ total: a.total + p.total, done: a.done + p.done }), { total: 0, done: 0 }),
  );
  /** "Barbell Row set 2": the first strength set not done yet. */
  const next = $derived.by(() => {
    const blocks = [...($currentSession?.blocks ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const b of blocks) {
      if (b.type !== "strength") continue;
      const d = b.data as StrengthBlockData;
      const working = [...d.sets].sort((x, y) => x.orderIndex - y.orderIndex).filter((x) => x.setType !== "warmup");
      const i = working.findIndex((x) => !x.completed);
      if (i !== -1) return `${d.exerciseName} set ${i + 1}`;
    }
    return null;
  });
  const line = $derived(
    rest && rest.endsAtMs > now
      ? `Rest ${clock(rest.endsAtMs - now)}${next ? ` · then ${next}` : ""}`
      : [totals.total ? `${totals.done} of ${totals.total} sets` : null, next ? `next ${next}` : null].filter(Boolean).join(" · "),
  );
  const pct = $derived(totals.total ? (totals.done / totals.total) * 100 : 0);
</script>

{#if shown && $currentSession}
  <div class="px-3 pb-6 pt-1" transition:fly={{ y: 12, duration: motionOK() ? 180 : 0 }}>
    <button
      type="button"
      class="relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-[14px] border border-input bg-muted pl-3 pr-2 text-left shadow-lg"
      aria-label="Back to the workout: {title}"
      onclick={() => goto("/session/current")}
    >
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background">
        {#if rest && rest.endsAtMs > now}<Timer class="size-4" />{:else}<Dumbbell class="size-4" />{/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm font-semibold tabular-nums">{title} · {clock(now - $currentSession.startedAtMs)}</span>
        {#if line}<span class="truncate text-xs text-muted-foreground tabular-nums">{line}</span>{/if}
      </span>
      <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground"><ChevronUp class="size-5" /></span>
      <span class="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-foreground/10" aria-hidden="true">
        <span class="block h-full bg-info transition-[width] duration-300" style="width: {pct}%"></span>
      </span>
    </button>
  </div>
{/if}
