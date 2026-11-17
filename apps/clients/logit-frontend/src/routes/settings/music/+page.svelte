<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { onMount } from "svelte";
  import { Music, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import * as Card from "$lib/components/ui/card";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { createId } from "@logit/core/domain/ids";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { musicSettings } from "$lib/features/music/musicSettings";
  import { music, musicControls, refreshAccess } from "$lib/features/music/nowPlaying.svelte";
  import {
    APP_LABEL,
    defaultLinkName,
    fetchLinkDetails,
    parseMusicLink,
  } from "$lib/features/music/playlistLinks";
  import type { PlaylistDay, WorkoutPlaylist } from "$lib/features/music/workoutPlaylists";

  let linkText = $state("");
  let adding = $state(false);
  let linkError = $state<string | null>(null);

  onMount(() => {
    void refreshAccess();
    if (!$activeSplit) void activeSplit.load();
    // Back from Android's Notification access screen.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAccess();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  const days = $derived(
    ($activeSplit?.days ?? [])
      .filter((d) => !d.rest)
      .map((d, i): PlaylistDay & { label: string } => ({
        splitId: $activeSplit!.id,
        dayId: d.id,
        dayName: d.name?.trim() || `Day ${i + 1}`,
        label: d.name?.trim() || `Day ${i + 1}`,
      })),
  );

  const toggles = $derived([
    {
      title: "Show the music bar in workouts",
      sub: "Play, pause and skip above your sets.",
      on: $musicSettings.barEnabled,
      flip: () => musicSettings.patch({ barEnabled: !$musicSettings.barEnabled, setupDismissed: false }),
    },
    {
      title: "Start my playlist when I start a workout",
      sub: "Plays the playlist linked to that split day, or the first one set to any day.",
      on: $musicSettings.autoplay,
      flip: () => musicSettings.patch({ autoplay: !$musicSettings.autoplay }),
    },
    {
      title: "Pause music when I finish",
      sub: "Stops playback after you tap Finish workout.",
      on: $musicSettings.pauseOnFinish,
      flip: () => musicSettings.patch({ pauseOnFinish: !$musicSettings.pauseOnFinish }),
    },
  ]);

  async function addLink() {
    linkError = null;
    const parsed = parseMusicLink(linkText);
    if (!parsed) {
      linkError = "That isn't a link. In Spotify or YouTube Music, tap Share › Copy link, then paste it here.";
      return;
    }
    if ($musicSettings.playlists.some((p) => p.url === parsed.url)) {
      linkError = "That playlist is already in your list.";
      return;
    }
    adding = true;
    try {
      const details = await fetchLinkDetails(parsed);
      const playlist: WorkoutPlaylist = {
        id: createId("pl"),
        name: details.title ?? defaultLinkName(parsed),
        url: parsed.url,
        app: parsed.app,
        kind: parsed.kind,
        packageName: parsed.packageName,
        playUri: parsed.playUri,
        imageUrl: details.imageUrl,
        day: null,
      };
      musicSettings.addPlaylist(playlist);
      linkText = "";
      if (!details.title) toast("Added. Tap its name to rename it.");
    } finally {
      adding = false;
    }
  }

  const ANY_DAY = "any";

  /** Any day, the split's days, and a day it was linked to that the split no longer has. */
  function dayOptions(p: WorkoutPlaylist): { value: string; label: string }[] {
    const opts = [{ value: ANY_DAY, label: "Any day" }, ...days.map((d) => ({ value: d.dayId, label: d.label }))];
    if (p.day && !days.some((d) => d.dayId === p.day?.dayId)) opts.push({ value: p.day.dayId, label: p.day.dayName });
    return opts;
  }

  function setDay(p: WorkoutPlaylist, dayId: string) {
    if (dayId === (p.day?.dayId ?? ANY_DAY)) return;
    const day = days.find((d) => d.dayId === dayId);
    musicSettings.updatePlaylist(p.id, {
      day: day ? { splitId: day.splitId, dayId: day.dayId, dayName: day.dayName } : null,
    });
  }

  function rename(p: WorkoutPlaylist, value: string) {
    const name = value.trim();
    if (name && name !== p.name) musicSettings.updatePlaylist(p.id, { name });
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/settings")} />
    <h1 class="page-title">Music</h1>
  </PageHeader>

  {#if !music.supported}
    <Card.Root>
      <Card.Content class="flex items-start gap-3 py-4 text-sm text-muted-foreground">
        <Music class="mt-0.5 size-4 shrink-0" />
        <p>
          The music bar works in the LogIt Android app, where it can control Spotify, YouTube Music
          or any other music app. You can still save playlist links here.
        </p>
      </Card.Content>
    </Card.Root>
  {/if}

  {#if music.supported}
    <Card.Root class="gap-0 py-0">
      {#each toggles as t, i (t.title)}
        <label class="flex cursor-pointer items-center gap-3 px-4 py-3 {i > 0 ? 'border-t border-border' : ''}">
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-sm font-medium">{t.title}</span>
            <span class="text-xs leading-snug text-muted-foreground">{t.sub}</span>
          </span>
          <Switch checked={t.on} label={t.title} onchange={t.flip} />
        </label>
      {/each}
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title class="text-sm">Workout playlists</Card.Title>
      <Card.Description class="text-xs">
        Paste a share link from Spotify or YouTube Music. Tapping one opens it in that app.
        {#if days.length > 0}Link one to a day of your split to have it start on that day.{/if}
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2.5">
      {#each $musicSettings.playlists as p (p.id)}
        <div class="flex min-h-[52px] items-center gap-3 rounded-[10px] border border-border py-1.5 pr-1 pl-3">
          {#if p.imageUrl}
            <img src={p.imageUrl} alt="" class="size-8 shrink-0 rounded-md object-cover" />
          {:else}
            <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"><Music class="size-4" /></span>
          {/if}
          <span class="flex min-w-0 flex-1 flex-col">
            <input
              class="w-full min-w-0 truncate rounded-sm bg-transparent text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              value={p.name}
              aria-label="Playlist name"
              onchange={(e) => rename(p, (e.target as HTMLInputElement).value)}
            />
            <span class="text-[11px] text-muted-foreground">{APP_LABEL[p.app]}</span>
          </span>
          {#if days.length > 0 || p.day}
            {@const options = dayOptions(p)}
            <Select.Root
              type="single"
              value={p.day?.dayId ?? ANY_DAY}
              onValueChange={(v) => setDay(p, v)}
            >
              <Select.Trigger
                size="sm"
                class="h-8 max-w-[7.5rem] shrink-0 gap-1 rounded-full px-2.5 text-[11px] text-muted-foreground"
                aria-label="Day for {p.name}"
              >
                <span class="truncate">{options.find((o) => o.value === (p.day?.dayId ?? ANY_DAY))?.label}</span>
              </Select.Trigger>
              <Select.Content align="end">
                {#each options as o (o.value)}
                  <Select.Item value={o.value} label={o.label} />
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
          <button
            type="button"
            class="flex size-9 shrink-0 items-center justify-center text-muted-foreground"
            aria-label="Remove {p.name}"
            onclick={() => musicSettings.removePlaylist(p.id)}
          >
            <X class="size-4" />
          </button>
        </div>
      {/each}

      <form
        class="flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          void addLink();
        }}
      >
        <label class="flex min-w-0 flex-1">
          <span class="sr-only">Playlist link</span>
          <input
            bind:value={linkText}
            inputmode="url"
            autocomplete="off"
            placeholder="https://open.spotify.com/playlist/…"
            class="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <Button type="submit" class="h-10" disabled={adding || !linkText.trim()}>
          {adding ? "Adding…" : "Add"}
        </Button>
      </form>
      {#if linkError}
        <p class="text-xs text-destructive">{linkError}</p>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if music.supported && music.granted !== null}
    <div class="flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-3">
      <span class="size-2 shrink-0 rounded-full {music.granted ? 'bg-green-700' : 'bg-muted-foreground'}"></span>
      <span class="flex-1 text-xs text-foreground/80">
        {music.granted ? "Notification access is on" : "Notification access is off, so the bar can't see your music"}
      </span>
      <button type="button" class="min-h-8 text-xs font-medium text-muted-foreground" onclick={musicControls.openAccessSettings}>
        {music.granted ? "Manage" : "Turn on"}
      </button>
    </div>
  {/if}
</div>
