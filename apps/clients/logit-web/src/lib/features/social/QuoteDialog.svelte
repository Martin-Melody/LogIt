<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type ApiPost } from "@logit/core/api/socialApi";
  import { attachmentSummary } from "@logit/core/domain/sharedContent";

  let { open = $bindable(false), post, onposted }: { open?: boolean; post: ApiPost; onposted?: (p: ApiPost) => void } = $props();

  // A plain repost shares its original; quote that, not the empty repost.
  const quoted = $derived(post.repostOf && !post.body ? post.repostOf : post);
  const summary = $derived(attachmentSummary(quoted.type, quoted.payloadJson));
  let body = $state("");
  let sending = $state(false);

  $effect(() => { if (open) body = ""; });

  async function send() {
    if (!body.trim() || sending) return;
    sending = true;
    try {
      const created = await socialApi.repost(quoted.id, body.trim());
      onposted?.(created);
      toast.success("Posted");
      open = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post that");
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[560px]">
    <Dialog.Header>
      <Dialog.Title>Quote</Dialog.Title>
      <Dialog.Description>Say something about {quoted.authorDisplayName}'s post. It goes on your profile and your followers' feeds.</Dialog.Description>
    </Dialog.Header>
    <label for="quote-body" class="sr-only">Your comment</label>
    <textarea id="quote-body" bind:value={body} rows="3" maxlength="2000" placeholder="Add your thoughts"
      class="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"></textarea>
    <div class="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5 text-sm">
      <span class="text-xs font-semibold">{quoted.authorDisplayName} <span class="font-normal text-muted-foreground">@{quoted.authorUsername}</span></span>
      {#if quoted.body}<span class="line-clamp-3">{quoted.body}</span>{/if}
      {#if summary}<span class="text-xs text-muted-foreground">{summary.label}: {summary.title}</span>{/if}
    </div>
    <Dialog.Footer>
      <button type="button" onclick={() => (open = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" disabled={!body.trim() || sending} onclick={send}
        class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Post</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
