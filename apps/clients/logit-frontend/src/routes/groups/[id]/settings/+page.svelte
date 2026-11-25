<!-- Your settings in a group (design canvas P3): on the board or not (Strava's hide from
     leaderboards), notifications per group (Facebook groups), report, leave. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { groupsApi, type Group, type GroupNotify } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let group = $state<Group | null>(null);
  let error = $state(false);
  let leaving = $state(false);
  let reporting = $state(false);

  async function load() {
    try {
      group = await groupsApi.get(id);
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function set(change: { onBoard?: boolean; notify?: GroupNotify }) {
    if (!group) return;
    const before = group.me;
    group = { ...group, me: { ...group.me, ...change } };
    try {
      const me = await groupsApi.settings(group.id, change);
      group = { ...group, me };
    } catch {
      group = { ...group, me: before };
      toast.error("Couldn't save that. Try again.");
    }
  }

  async function leave() {
    if (!group) return;
    try {
      await groupsApi.removeMember(group.id, authStore.user?.username ?? "");
      toast.success(`You left ${group.name}`);
      await goto("/messages", { replaceState: true });
    } catch {
      toast.error("Couldn't leave. Try again.");
    }
  }

  const option = "flex min-h-13 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 text-[15px] last:border-b-0";
</script>

<PageHeader>
  <BackButton onclick={() => back(`/groups/${id}`)} />
  <span class="flex min-w-0 flex-col">
    <h1 class="page-title">Your settings</h1>
    {#if group}<span class="truncate text-[12px] text-muted-foreground">{group.name}</span>{/if}
  </span>
</PageHeader>

<div class="flex flex-col gap-6 p-3 pb-24">
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load the group. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !group}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <SettingsSection title="What members see" note="Members always see your name and photo in the member list and on events you're going to. Your workouts and weights are never shown to the group.">
      <div class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px]">Show me on this group's board</span><span class="text-[13px] text-muted-foreground">Off, you still see the board and stay a member; your row just isn't on it</span></span>
        <Switch checked={group.me.onBoard} label="Show me on this group's board" onchange={(v) => set({ onBoard: v })} />
      </div>
    </SettingsSection>

    <SettingsSection title="Notifications">
      <RadioGroup.Root value={group.me.notify} aria-label="Notifications from this group" onValueChange={(v) => set({ notify: v as GroupNotify })}>
        <label class={option}>Every chat message<RadioGroup.Item value="All" /></label>
        <label class={option}>Events, notes and mentions<RadioGroup.Item value="Important" /></label>
        <label class={option}>Off<RadioGroup.Item value="Off" /></label>
      </RadioGroup.Root>
    </SettingsSection>

    <div class="flex flex-col gap-2">
      {#if group.me.role !== "Organiser"}<button type="button" class="h-12 rounded-lg border border-border text-[15px] font-medium text-destructive" onclick={() => (reporting = true)}>Report group</button>{/if}
      <button type="button" class="h-12 rounded-lg border border-border text-[15px] font-medium text-destructive" onclick={() => (leaving = true)}>Leave {group.name}</button>
    </div>
  {/if}
</div>

{#if group}
  <ConfirmDialog open={leaving} onOpenChange={(v) => (leaving = v)} title="Leave {group.name}?" description="You'll be off the board and out of the chat. You can join again with the link." confirmLabel="Leave" onConfirm={leave} />
  {#if reporting}<ReportSheet open targetType="Group" targetId={group.id} what="group" onclose={() => (reporting = false)} />{/if}
{/if}
