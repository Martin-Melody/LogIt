<!-- The photo waiting in a chat's message box (shadcn Attachment), until Send. -->
<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { fade } from "svelte/transition";
  import * as Attachment from "$lib/components/ui/attachment/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import type { StagedPhoto } from "./stagedPhoto.svelte";

  let { staged }: { staged: StagedPhoto } = $props();
</script>

{#if staged.current}
  {@const st = staged.current}
  <div transition:fade={{ duration: 120 }}>
    <Attachment.Root state={st.state === "done" ? "idle" : st.state} size="sm" class="max-w-sm">
      <Attachment.Media variant="image" class="w-12">
        <img src={st.preview} alt="" />
        {#if st.state === "uploading"}<Spinner class="absolute size-4 text-white" />{/if}
      </Attachment.Media>
      <Attachment.Content>
        <Attachment.Title class="text-[13px]">Photo</Attachment.Title>
        <Attachment.Description class="text-xs text-muted-foreground">{st.state === "uploading" ? "Uploading…" : st.state === "error" ? (st.error ?? "Couldn't upload it.") : "Ready. Add a caption or just send it."}</Attachment.Description>
      </Attachment.Content>
      <Attachment.Actions class="gap-1">
        {#if st.state === "error"}<button type="button" class="h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted" onclick={() => void staged.upload()}>Try again</button>{/if}
        <button type="button" aria-label="Remove the photo" class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onclick={() => staged.drop()}><XIcon class="size-4" /></button>
      </Attachment.Actions>
    </Attachment.Root>
  </div>
{/if}
