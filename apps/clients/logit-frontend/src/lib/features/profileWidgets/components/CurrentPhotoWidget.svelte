<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { log } from "@logit/core/platform/log";
  import { Camera, ImagePlus, X } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { profile } from "$lib/stores/profile.store";
  import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";

  // V1 is one current photo, not a gallery/timeline — no object storage exists in the API
  // today. Same storage pattern as the identity avatar (ProfileAvatar.svelte): client-resize
  // → base64 data-URL, pushed to the server as part of the public profile snapshot rather
  // than a dedicated file. See docs/architecture/profile-progress-redesign.md.
  let picking = $state(false);

  async function pick() {
    if (picking) return;
    picking = true;
    try {
      const chosen = await choosePhoto({ title: "Progress photo", crop: { aspect: 1 }, maxPx: 1024, canRemove: !!$profile.progressPhotoDataUrl });
      if (chosen) profile.save({ progressPhotoDataUrl: "photo" in chosen ? chosen.photo : "" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("cancel")) log.error("photo", "Progress photo pick failed", err);
    } finally {
      picking = false;
    }
  }

  function clear() {
    profile.save({ progressPhotoDataUrl: "" });
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-sm">Progress Photo</Card.Title>
    {#if $profile.progressPhotoDataUrl}
      <Card.Action>
        <button type="button" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onclick={clear}>
          <X class="h-3 w-3" /> Remove
        </button>
      </Card.Action>
    {/if}
  </Card.Header>

  <Card.Content>
    <button
      type="button"
      class="relative w-full rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square flex items-center justify-center disabled:opacity-70"
      disabled={picking}
      onclick={pick}
    >
      {#if $profile.progressPhotoDataUrl}
        <img src={photoSrc($profile.progressPhotoDataUrl)} alt="Your progress" class="h-full w-full object-cover" />
        <div class="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
          {#if picking}<Spinner class="h-3.5 w-3.5 text-muted-foreground" />{:else}<Camera class="h-3.5 w-3.5 text-muted-foreground" />{/if}
        </div>
      {:else}
        <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          {#if picking}
            <Spinner class="h-6 w-6" />
          {:else}
            <ImagePlus class="h-6 w-6" />
            <span class="text-xs">Add a progress photo</span>
          {/if}
        </div>
      {/if}
    </button>
  </Card.Content>
</Card.Root>
