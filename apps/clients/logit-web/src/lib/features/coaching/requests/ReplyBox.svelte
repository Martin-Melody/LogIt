<!-- The optional message in Offer a spot, Waiting list and Not a fit: a text box where "/" opens
     your saved replies (as in a conversation), plus a button for people who don't know the "/". -->
<script lang="ts">
  import { apiClient } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import SavedReplyPicker from "../SavedReplyPicker.svelte";

  let { id, value = $bindable(""), name }: { id: string; value?: string; name: string } = $props();

  let picker = $state<SavedReplyPicker | null>(null);
  let open = $state(false);
  const me = apiClient.getUser();
  const fill = $derived({ firstName: name.split(" ")[0] ?? name, coachName: me?.displayName || me?.username || null });
</script>

<div class="flex flex-col gap-1.5">
  <SavedReplyPicker bind:this={picker} bind:draft={value} bind:open {fill} />
  <Textarea {id} rows={3} maxlength={4000} bind:value onkeydown={(e) => { if (picker?.key(e)) return; }} />
  <span class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
    <span>Type / for a saved reply</span>
    <Button variant="ghost" size="sm" type="button" onclick={() => (open = !open)}>Saved replies</Button>
  </span>
</div>
