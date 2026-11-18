<script lang="ts">
  import { goto } from "$app/navigation";
  import { MoreVertical, Music, Trash2 } from "lucide-svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import { music } from "$lib/features/music/nowPlaying.svelte";

  const {
    saving = false,
    error = null,
    startedAtMs = null,
    showActions = true,
    canFinish = false,
    exerciseCount = 0,
    loggedSetCount = 0,
    onFinish = () => {},
    onDiscard,
  }: {
    saving?: boolean;
    error?: string | null;
    startedAtMs?: number | null;
    /** Finish and the ⋯ menu; hidden while the workout is being finished. */
    showActions?: boolean;
    canFinish?: boolean;
    exerciseCount?: number;
    loggedSetCount?: number;
    onFinish?: () => void | Promise<void>;
    onDiscard?: () => void | Promise<void>;
  } = $props();

  let now = $state(Date.now());
  let confirmDiscard = $state(false);

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

  const discardDescription = $derived(
    exerciseCount === 0
      ? "This empty workout will be discarded. This can't be undone."
      : `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}` +
        (loggedSetCount > 0
          ? ` and ${loggedSetCount} logged set${loggedSetCount === 1 ? "" : "s"}`
          : "") +
        " will be permanently deleted. This can't be undone.",
  );
</script>

<!-- In the shared header (same place as every other page's, so landing here doesn't
     shift the page), without the bell while training. Finish and Discard live up here
     so the bottom of the screen only holds the music bar and the nav. -->
<PageHeader bell={false}>
  <BackButton onclick={() => back("/")} />

  <h1 class="page-title">Workout</h1>

  {#if saving}
    <span class="text-xs text-muted-foreground shrink-0">Saving…</span>
  {:else if elapsedLabel}
    <span
      class="text-xs text-muted-foreground shrink-0 tabular-nums"
      aria-label="Elapsed workout time"
    >
      {elapsedLabel}
    </span>
  {/if}

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

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
        aria-label="Workout options"
      >
        <MoreVertical class="h-5 w-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-56">
        {#if music.supported}
          <DropdownMenu.Item onSelect={() => void goto("/settings/music")}>
            <Music /> Music settings
          </DropdownMenu.Item>
          <div class="my-1 h-px bg-border" role="separator"></div>
        {/if}
        {#if onDiscard}
          <DropdownMenu.Item
            variant="destructive"
            disabled={saving}
            onSelect={() => (confirmDiscard = true)}
          >
            <Trash2 /> Discard workout…
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</PageHeader>

{#if onDiscard}
  <ConfirmDialog
    open={confirmDiscard}
    onOpenChange={(v) => (confirmDiscard = v)}
    title="Discard this workout?"
    description={discardDescription}
    confirmLabel="Discard"
    cancelLabel="Keep going"
    {saving}
    onConfirm={onDiscard}
  />
{/if}

{#if error}
  <p class="px-3 py-1.5 text-sm text-destructive border-b border-border">{error}</p>
{/if}
