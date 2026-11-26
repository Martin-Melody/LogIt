<!-- The picked photo above a chat's message box (shadcn Attachment), until Send. -->
<script lang="ts">
  import { X } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import * as Attachment from "$lib/components/ui/attachment/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import type { StagedPhoto } from "$lib/features/chat/stagedPhoto.svelte";

  let { staged, bordered = true }: { staged: StagedPhoto; bordered?: boolean } = $props();
</script>

{#if staged.current}
  {@const st = staged.current}
  <div transition:fade={{ duration: 120 }} class="shrink-0 {bordered ? 'border-t' : ''} border-border px-3 pt-2">
    <Attachment.Root state={st.state === "done" ? "idle" : st.state} class="w-full rounded-2xl">
      <Attachment.Media variant="image" class="w-14 rounded-xl">
        <img src={st.preview} alt="" />
        {#if st.state === "uploading"}<Spinner class="absolute size-5 text-white" />{/if}
      </Attachment.Media>
      <Attachment.Content>
        <Attachment.Title class="text-[14px]">Photo</Attachment.Title>
        <Attachment.Description class="text-[13px] text-muted-foreground">{st.state === "uploading" ? "Uploading…" : st.state === "error" ? "Couldn't upload it." : "Ready. Add a caption or just send it."}</Attachment.Description>
      </Attachment.Content>
      <Attachment.Actions class="gap-1">
        {#if st.state === "error"}<button type="button" class="h-9 rounded-lg border border-border px-3 text-[13px] font-medium" onclick={() => void staged.upload()}>Try again</button>{/if}
        <button type="button" aria-label="Remove the photo" class="flex size-11 items-center justify-center rounded-full text-muted-foreground" onclick={() => staged.drop()}><X class="size-5" /></button>
      </Attachment.Actions>
    </Attachment.Root>
  </div>
{/if}
