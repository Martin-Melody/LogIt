<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { musicSettings } from "./musicSettings";
  import { music, musicControls } from "./nowPlaying.svelte";

  const { open = false, onOpenChange = (_v: boolean) => {} } = $props<{
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }>();

  // Closes itself once access is on (the user comes back from Android's settings).
  $effect(() => {
    if (open && music.granted) onOpenChange(false);
  });

  const steps = [
    ["Android will open ", "Notification access", ". Turn LogIt on and tap Allow."],
    [
      "Android's warning lists everything that access could do. LogIt only uses it to see and control what's playing: your notifications aren't read, stored or sent anywhere.",
      "",
      "",
    ],
    ["No Spotify or Google sign-in needed. Turn it off any time in Settings › Music.", "", ""],
  ] as const;

  function notNow() {
    musicSettings.patch({ setupDismissed: true });
    onOpenChange(false);
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content
    class="top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom gap-4 rounded-t-2xl rounded-b-none border-x-0 border-b-0 px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-full"
  >
    <div class="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden="true"></div>
    <Dialog.Header class="gap-2 pr-8 text-left">
      <Dialog.Title class="text-xl leading-snug">Control your music without leaving LogIt</Dialog.Title>
      <Dialog.Description class="text-sm leading-relaxed text-foreground/80">
        Pause, skip and see what's playing in Spotify, YouTube Music or any other music app, right above your sets.
      </Dialog.Description>
    </Dialog.Header>

    <ol class="flex flex-col gap-2.5">
      {#each steps as [before, strong, after], i (i)}
        <li class="flex gap-2.5 text-[13px] leading-snug text-foreground/80">
          <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{i + 1}</span>
          <span>{before}{#if strong}<strong class="text-foreground">{strong}</strong>{/if}{after}</span>
        </li>
      {/each}
    </ol>

    <div class="mt-1 flex flex-col gap-2">
      <Button class="h-11" onclick={musicControls.openAccessSettings}>Open Android settings</Button>
      <Button variant="ghost" class="h-10 text-muted-foreground" onclick={notNow}>Not now</Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
