<script lang="ts">
  import { Camera, User } from "lucide-svelte";
  import * as Avatar from "$lib/components/ui/avatar";
  import { profile } from "$lib/stores/profile.store";
  import { pickImageFile } from "$lib/platform/filePick";

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

  function resizeImage(file: File, maxPx: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function pick() {
    if (!editable || picking) return;
    picking = true;
    try {
      const file = await pickImageFile();
      const dataUrl = await resizeImage(file, 512);
      profile.save({ avatarDataUrl: dataUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("cancel")) {
        console.error("[ProfileAvatar] pick failed", err);
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
      <Avatar.Image src={avatarDataUrl} alt={name || "Profile photo"} />
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
