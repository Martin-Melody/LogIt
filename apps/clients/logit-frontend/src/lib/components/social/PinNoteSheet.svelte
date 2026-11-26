<!-- Pin a note (design canvas G9, organisers): one note at a time at the top of the group page,
     with an optional push to members who chose "Events, notes and mentions" or every message. -->
<script lang="ts">
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { groupsApi, type Group } from "@logit/core/api/groupsApi";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { Textarea } from "$lib/components/ui/textarea";

  const { group, onclose, onsaved }: { group: Group; onclose: () => void; onsaved: (g: Group | null) => void } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(group.note?.text ?? "");
  let notify = $state(true);
  let saving = $state(false);

  async function pin() {
    saving = true;
    try {
      onsaved(await groupsApi.pin(group.id, text.trim(), notify));
      toast.success("Note pinned");
      onclose();
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't pin it. Try again.");
    } finally {
      saving = false;
    }
  }

  async function unpin() {
    saving = true;
    try {
      await groupsApi.unpin(group.id);
      onsaved(null);
      toast.success("Note removed");
      onclose();
    } catch {
      toast.error("Couldn't remove it. Try again.");
    } finally {
      saving = false;
    }
  }
</script>

<BottomSheet label="Pin a note" {onclose}>
  <div class="flex flex-col gap-4 px-4 pb-3">
    <h2 class="text-[19px] font-semibold">Pin a note</h2>
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Note</span>
      <Textarea bind:value={text} rows={4} maxlength={500} placeholder="Opening hours, rules, what's on" class="min-h-28 text-[15px]" />
      <span class="text-[12px] text-muted-foreground">Shown at the top of the group page until you change or remove it. {500 - text.length} characters left.</span>
    </label>
    <div class="flex min-h-14 items-center gap-3 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
      <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Let members know</span><span class="text-[13px] text-muted-foreground">A push to members with "Events, notes and mentions" on</span></span>
      <Switch checked={notify} label="Let members know" onchange={(v) => (notify = v)} />
    </div>
    <button type="button" disabled={saving || !text.trim()} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60" onclick={pin}>Pin it</button>
    {#if group.note}<button type="button" disabled={saving} class="h-11 rounded-lg text-sm font-medium text-destructive" onclick={unpin}>Remove the pinned note</button>{/if}
  </div>
</BottomSheet>
