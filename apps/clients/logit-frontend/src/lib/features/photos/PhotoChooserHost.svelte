<!-- Draws the photo chooser's steps (design canvas U1, U3, U5): our sheet, then the cropper.
     The phone's own picker or camera (U2) opens in between. Mounted once in the root layout. -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { Camera, ImageIcon, Trash2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import ImageCropper from "@logit/ui/ImageCropper.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { chip, menuRow } from "$lib/components/ui/choice";
  import { backDismiss } from "$lib/components/sheet/sheet";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";
  import { chooser, finishChoice } from "./photoChooser.svelte";

  const step = $derived(chooser.step);
  let menuOpen = $state(false);
  let acting = false;
  let aspect = $state<number | null>(null);
  let cropper = $state<ReturnType<typeof ImageCropper> | null>(null);
  let saving = $state(false);

  // A new choice opens on the sheet.
  $effect(() => {
    if (step && !step.cropping) {
      acting = false;
      menuOpen = true;
    }
  });

  function onOpenChange(open: boolean) {
    menuOpen = open;
    // Closed by tapping outside, back or dragging it down: nothing chosen.
    if (!open && !acting) finishChoice(null);
  }

  async function pick(from: "photos" | "camera") {
    const s = step;
    if (!s) return;
    acting = true;
    menuOpen = false;
    try {
      const file = await pickImageFile(from);
      if (s.opts.crop) {
        aspect = s.opts.crop.aspect;
        s.cropping = URL.createObjectURL(file);
      } else {
        finishChoice({ photo: await resizeImageFile(file, s.opts.maxPx, s.opts.quality ?? 0.85) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (!msg.includes("cancel") && !msg.includes("no file") && !msg.includes("no image")) toast.error("Couldn't open that photo. Try another one.");
      finishChoice(null);
    }
  }

  function remove() {
    acting = true;
    menuOpen = false;
    finishChoice({ removed: true });
  }

  async function done() {
    if (!step || !cropper || saving) return;
    saving = true;
    try {
      finishChoice({ photo: await cropper.result(step.opts.maxPx, step.opts.quality ?? 0.85) });
    } catch {
      toast.error("Couldn't crop that photo. Try again.");
    } finally {
      saving = false;
    }
  }
</script>

{#if step && !step.cropping}
  <Dialog.Root open={menuOpen} {onOpenChange}>
    <Dialog.Content sheet showCloseButton={false} class="gap-1 bg-card px-3">
      <div class="px-2 pb-2">
        <Dialog.Title class="text-[19px] font-semibold">{step.opts.title}</Dialog.Title>
        <Dialog.Description class="sr-only">Choose a photo, take one, or remove this one</Dialog.Description>
      </div>
      <button type="button" class={menuRow} onclick={() => void pick("photos")}><ImageIcon /> Choose from your photos</button>
      <button type="button" class={menuRow} onclick={() => void pick("camera")}><Camera /> Take a photo</button>
      {#if step.opts.canRemove}
        <button type="button" class="{menuRow} text-destructive" onclick={remove}><Trash2 /> Remove photo</button>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/if}

{#if step?.cropping && step.opts.crop}
  {@const crop = step.opts.crop}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="crop-title"
    class="fixed inset-0 z-[60] flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[calc(1rem+env(safe-area-inset-bottom))] text-white"
    transition:fade={{ duration: 150 }}
    use:backDismiss={() => finishChoice(null)}
  >
    <header class="flex min-h-14 items-center justify-between px-2">
      <button type="button" class="h-11 px-3 text-[15px]" onclick={() => finishChoice(null)}>Cancel</button>
      <h1 id="crop-title" class="text-base font-semibold">{crop.aspects ? "Crop" : "Move and zoom"}</h1>
      <button type="button" class="h-11 px-3 text-[15px] font-bold disabled:opacity-50" disabled={saving} onclick={() => void done()}>Done</button>
    </header>
    <ImageCropper bind:this={cropper} src={step.cropping} {aspect} round={crop.round} class="flex-1" />
    {#if crop.aspects}
      <div class="flex justify-center gap-2 px-4 pt-3" role="group" aria-label="Shape">
        {#each crop.aspects as a (a.label)}
          <button type="button" aria-pressed={aspect === a.value} class={chip(aspect === a.value, aspect === a.value ? "" : "bg-transparent text-white")} onclick={() => (aspect = a.value)}>{a.label}</button>
        {/each}
      </div>
    {/if}
    <p class="px-6 pt-3 text-center text-[13px] leading-normal text-white/70">
      {crop.round ? "Drag the photo to move it, pinch or use the slider to zoom. The circle is what everyone sees." : "Drag to move it, pinch or use the slider to zoom."}
    </p>
  </div>
{/if}
