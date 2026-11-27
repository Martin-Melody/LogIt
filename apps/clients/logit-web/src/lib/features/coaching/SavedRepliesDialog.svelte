<!-- Canvas W10: your saved replies. Each is a /shortcut, a title and plain text, with {first name},
     {exercise} and {coach name} filled in when used. Deleting one has Undo. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";
  import { createId } from "@logit/core/domain/ids";
  import type { SavedReply } from "@logit/core/domain/savedReplies";
  import { savedReplies } from "./savedReplies.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let editing = $state<SavedReply | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    if (open) { void savedReplies.load(); editing = null; error = null; }
  });

  function startNew() {
    editing = { id: createId("reply"), shortcut: "", title: "", body: "" };
    error = null;
  }
  async function saveEditing() {
    const e = editing;
    if (!e) return;
    const shortcut = e.shortcut.trim().replace(/^\//, "");
    if (!shortcut || /\s/.test(shortcut)) return void (error = "A shortcut is one word, like swap.");
    if (savedReplies.list.some((r) => r.id !== e.id && r.shortcut.toLowerCase() === shortcut.toLowerCase())) return void (error = `/${shortcut} is taken.`);
    if (!e.body.trim()) return void (error = "Write the reply.");
    const next = savedReplies.list.some((r) => r.id === e.id) ? savedReplies.list.map((r) => (r.id === e.id ? { ...e, shortcut } : r)) : [...savedReplies.list, { ...e, shortcut }];
    try {
      await savedReplies.save(next);
      editing = null;
    } catch (x) {
      error = x instanceof Error ? x.message : "Couldn't save it";
    }
  }
  async function remove(r: SavedReply) {
    const before = savedReplies.list;
    try {
      await savedReplies.save(before.filter((x) => x.id !== r.id));
      toast.success(`Deleted /${r.shortcut}`, { action: { label: "Undo", onClick: () => void savedReplies.save(before) } });
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Couldn't delete it");
    }
  }
  async function addStarters() {
    try { await savedReplies.save(savedReplies.starters()); } catch (x) { toast.error(x instanceof Error ? x.message : "Couldn't add them"); }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Saved replies</Dialog.Title>
      <Dialog.Description>Type / in any message box to use one. Fill-ins: {"{first name}"}, {"{exercise}"} (when they've asked about one), {"{coach name}"}.</Dialog.Description>
    </Dialog.Header>
    {#if editing}
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-[8rem_1fr] gap-3">
          <div class="flex flex-col gap-1.5"><Label for="sr-short">Shortcut</Label>
            <span class="flex items-center gap-1"><span class="text-muted-foreground">/</span><input id="sr-short" bind:value={editing.shortcut} placeholder="swap" class="h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-[13px]" /></span>
          </div>
          <div class="flex flex-col gap-1.5"><Label for="sr-title">Title</Label>
            <input id="sr-title" bind:value={editing.title} placeholder="Swap is fine" class="h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px]" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5"><Label for="sr-body">Reply</Label>
          <Textarea id="sr-body" rows={4} bind:value={editing.body} placeholder="Yep, {'{exercise}'} for now, same sets and reps." />
        </div>
        {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
        <span class="flex justify-end gap-2">
          <Button variant="outline" onclick={() => (editing = null)}>Cancel</Button>
          <Button onclick={() => void saveEditing()}>Save reply</Button>
        </span>
      </div>
    {:else}
      <ul class="flex flex-col">
        {#each savedReplies.list as r (r.id)}
          <li class="flex items-start gap-3 border-t border-border py-2.5 text-[13px]">
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span><b class="font-semibold">/{r.shortcut}</b>{#if r.title}<span class="text-muted-foreground"> · {r.title}</span>{/if}</span>
              <span class="line-clamp-2 text-muted-foreground">{r.body}</span>
            </span>
            <Button variant="outline" size="sm" onclick={() => { editing = { ...r }; error = null; }}>Edit</Button>
            <Button variant="ghost" size="sm" onclick={() => void remove(r)}>Delete</Button>
          </li>
        {:else}
          <li class="flex flex-col items-start gap-2 py-3 text-[13px] text-muted-foreground">
            No saved replies yet.
            <Button variant="outline" size="sm" onclick={() => void addStarters()}>Start with four examples</Button>
          </li>
        {/each}
      </ul>
      <Dialog.Footer><Button onclick={startNew}>New reply</Button></Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
