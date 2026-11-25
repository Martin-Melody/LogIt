<!-- A group's members (design canvas G7): everyone sees the list; organisers get ⋯ on each
     member to make them an organiser or remove them. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Crown, Loader2, MoreHorizontal, Search, User, UserX } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { groupsApi, type Group, type GroupMember } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import GroupInviteSheet from "$lib/components/social/GroupInviteSheet.svelte";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let group = $state<Group | null>(null);
  let members = $state<GroupMember[] | null>(null);
  let error = $state(false);
  let query = $state("");
  let picked = $state<GroupMember | null>(null);
  let removing = $state<GroupMember | null>(null);
  let inviting = $state(false);
  const me = $derived(authStore.user?.username ?? "");
  const organiser = $derived(group?.me.role === "Organiser");

  async function load() {
    try {
      [group, members] = await Promise.all([groupsApi.get(id), groupsApi.members(id)]);
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = (members ?? []).filter((m) => !q || m.user.displayName.toLowerCase().includes(q) || m.user.username.includes(q));
    // You first, then organisers, then by name (the server's order).
    return [...list.filter((m) => m.user.username === me), ...list.filter((m) => m.user.username !== me)];
  });
  const since = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "long", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

  async function setRole(m: GroupMember, role: "Member" | "Organiser") {
    try {
      await groupsApi.setRole(id, m.user.username, role);
      await load();
      toast.success(role === "Organiser" ? `${m.user.displayName} is an organiser` : `${m.user.displayName} is a member`);
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  async function remove() {
    const m = removing;
    removing = null;
    if (!m) return;
    try {
      await groupsApi.removeMember(id, m.user.username);
      members = (members ?? []).filter((x) => x.user.username !== m.user.username);
      toast.success(`${m.user.displayName} removed`);
    } catch {
      toast.error("Couldn't remove them. Try again.");
    }
  }

  const actions = $derived.by(() => {
    const m = picked;
    if (!m) return [];
    return [
      { icon: User, label: "View profile", onSelect: () => void goto(`/social/${m.user.username}`) },
      ...(organiser
        ? [
            m.role === "Organiser"
              ? { icon: Crown, label: "Make a member", onSelect: () => void setRole(m, "Member") }
              : { icon: Crown, label: "Make organiser", onSelect: () => void setRole(m, "Organiser") },
            { icon: UserX, label: "Remove from the group", destructive: true, onSelect: () => (removing = m) },
          ]
        : []),
    ];
  });
</script>

<PageHeader>
  <BackButton onclick={() => back(`/groups/${id}`)} />
  <span class="flex min-w-0 flex-1 flex-col">
    <h1 class="page-title">Members</h1>
    {#if group}<span class="truncate text-[12px] text-muted-foreground">{group.name} · {group.members}</span>{/if}
  </span>
  {#if group}<button type="button" class="mr-1 h-9 rounded-lg border border-border px-3 text-sm font-medium" onclick={() => (inviting = true)}>Invite</button>{/if}
</PageHeader>

<div class="flex flex-col pb-24">
  {#if error}
    <p class="px-4 py-10 text-center text-sm text-muted-foreground">Couldn't load the members. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !members}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    {#if members.length > 8}
      <label class="mx-4 my-2.5 flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-muted-foreground">
        <Search class="size-4" /><input bind:value={query} placeholder="Search members" aria-label="Search members" class="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
    {/if}
    <ul>
      {#each shown as m (m.user.id)}
        {@const mine = m.user.username === me}
        <li class="flex min-h-14 items-center gap-3 border-b border-border px-4">
          <a href={mine ? "/profile" : `/social/${m.user.username}`} class="flex min-w-0 flex-1 items-center gap-3 py-2 text-inherit no-underline">
            <PersonAvatar name={m.user.displayName} src={m.user.avatarUrl} size={40} />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-[15px] font-medium">{mine ? "You" : m.user.displayName || m.user.username}</span>
              <span class="truncate text-[12px] text-muted-foreground">{m.role === "Organiser" ? "Organiser" : `Member since ${since(m.joinedAtMs)}`}</span>
            </span>
          </a>
          {#if !mine}<button type="button" aria-label="Options for {m.user.displayName}" class="flex size-11 shrink-0 items-center justify-center text-muted-foreground" onclick={() => (picked = m)}><MoreHorizontal class="size-5" /></button>{/if}
        </li>
      {/each}
    </ul>
    {#if shown.length === 0}<p class="px-4 py-8 text-center text-sm text-muted-foreground">Nobody by that name.</p>{/if}
  {/if}
</div>

<ActionSheet open={!!picked} onOpenChange={(v) => { if (!v) picked = null; }} title={picked ? `${picked.user.displayName} · @${picked.user.username}` : ""} items={actions} />
<ConfirmDialog
  open={!!removing}
  onOpenChange={(v) => { if (!v) removing = null; }}
  title="Remove {removing?.user.displayName ?? ''}?"
  description="They're taken out of the group and its chat. They can join again with the link unless you reset it."
  confirmLabel="Remove"
  onConfirm={remove}
/>
{#if inviting && group}<GroupInviteSheet name={group.name} code={group.inviteCode} onclose={() => (inviting = false)} />{/if}
