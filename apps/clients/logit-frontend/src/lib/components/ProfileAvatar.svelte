<script lang="ts">
  import { log } from "@logit/core/platform/log";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { Camera, User } from "lucide-svelte";
  import * as Avatar from "$lib/components/ui/avatar";
  import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";
  import { saveProfile } from "$lib/features/profileWidgets/publicProfileSync";

  let {
    name = "",
    avatarDataUrl = undefined as string | undefined,
    editable = false,
    class: className = "",
  }: {
    name?: string;
    avatarDataUrl?: string;
    editable?: boolean;
    class?: string;
  } = $props();

  let picking = $state(false);

  function initials(n: string) {
    return n
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  async function pick() {
    if (!editable || picking) return;
    picking = true;
    try {
      const chosen = await choosePhoto({ title: "Profile photo", crop: { aspect: 1, round: true }, maxPx: 512, canRemove: !!avatarDataUrl });
      // "" = no photo. Shows here at once; sent to your account (later, if offline).
      if (chosen) await saveProfile({ avatar: "photo" in chosen ? chosen.photo : "" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("cancel")) {
        log.error("photo", "Avatar pick failed", err);
      }
    } finally {
      picking = false;
    }
  }

  const ini = $derived(initials(name));
</script>

<div
  class="relative {className}"
  class:cursor-pointer={editable}
  role={editable ? "button" : "img"}
  aria-label={editable ? "Change profile photo" : (name || "Profile photo")}
  onclick={editable ? () => void pick() : undefined}
>
  <Avatar.Root class="size-full rounded-full">
    {#if avatarDataUrl}
      <Avatar.Image src={photoSrc(avatarDataUrl)} alt={name || "Profile photo"} />
    {/if}
    <Avatar.Fallback class="size-full rounded-full bg-muted border flex items-center justify-center">
      {#if ini}
        <span class="font-bold text-muted-foreground text-3xl leading-none">{ini}</span>
      {:else}
        <User class="h-[45%] w-[45%] text-muted-foreground/40" />
      {/if}
    </Avatar.Fallback>
  </Avatar.Root>

  {#if editable}
    <div class="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center shadow-sm pointer-events-none">
      {#if picking}
        <div class="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin"></div>
      {:else}
        <Camera class="h-3.5 w-3.5 text-muted-foreground" />
      {/if}
    </div>
  {/if}
</div>
