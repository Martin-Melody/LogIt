<!-- A group's members (design canvas G7, D1): organisers and moderators first. Organisers give
     roles; organisers and moderators mute members in the chat, remove them, and answer requests
     to join at the top (G14). -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { muteItems } from "$lib/features/groups/muteItems";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Crown, MoreHorizontal, Search, Shield, User, UserX, Volume2, VolumeX } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { canModerate, groupsApi, type Group, type GroupMember, type GroupRequest, type GroupRole } from "@logit/core/api/groupsApi";
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
  let requests = $state<GroupRequest[]>([]);
  let error = $state(false);
  let query = $state("");
  let picked = $state<GroupMember | null>(null);
  let removing = $state<GroupMember | null>(null);
  let inviting = $state(false);
  const me = $derived(authStore.user?.username ?? "");
  const organiser = $derived(group?.me.role === "Organiser");
  const moderator = $derived(!!group && canModerate(group.me.role));
  let muting = $state<GroupMember | null>(null);
  const roleText = (m: GroupMember) =>
    m.mutedUntilMs ? `Muted in the chat until ${new Date(m.mutedUntilMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : m.role === "Member" ? `Member since ${since(m.joinedAtMs)}` : m.role;

  async function load() {
    try {
      [group, members] = await Promise.all([groupsApi.get(id), groupsApi.members(id)]);
      requests = canModerate(group.me.role) ? await groupsApi.requests(id).catch(() => []) : [];
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

  async function setRole(m: GroupMember, role: GroupRole) {
    try {
      await groupsApi.setRole(id, m.user.username, role);
      await load();
      toast.success(`${m.user.displayName} is ${role === "Member" ? "a member" : role === "Organiser" ? "an organiser" : "a moderator"}`);
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  // Approving adds them (and tells them); declining tells nobody.
  async function answer(r: GroupRequest, approve: boolean) {
    requests = requests.filter((x) => x.user.id !== r.user.id);
    try {
      if (approve) {
        await groupsApi.approve(id, r.user.username);
        await load();
        toast.success(`${r.user.displayName} is in`);
      } else await groupsApi.decline(id, r.user.username);
    } catch {
      requests = [r, ...requests];
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

  async function mute(m: GroupMember, minutes: number | null) {
    try {
      await groupsApi.mute(id, m.user.username, minutes);
      await load();
      toast.success(minutes ? `${m.user.displayName} is muted in the chat` : `${m.user.displayName} can send again`);
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  // Organisers do everything; moderators mute and remove members (not organisers or moderators).
  const actions = $derived.by(() => {
    const m = picked;
    if (!m) return [];
    const canAct = organiser || (moderator && m.role === "Member");
    return [
      { icon: User, label: "View profile", onSelect: () => void goto(`/social/${m.user.username}`) },
      ...(organiser && m.role !== "Moderator" ? [{ icon: Shield, label: "Make moderator", onSelect: () => void setRole(m, "Moderator") }] : []),
      ...(organiser && m.role !== "Organiser" ? [{ icon: Crown, label: "Make organiser", onSelect: () => void setRole(m, "Organiser") }] : []),
      ...(organiser && m.role !== "Member" ? [{ icon: User, label: "Make a member", onSelect: () => void setRole(m, "Member") }] : []),
      ...(canAct ? [m.mutedUntilMs
        ? { icon: Volume2, label: "Unmute in the chat", onSelect: () => void mute(m, null) }
        : { icon: VolumeX, label: "Mute in the chat", onSelect: () => (muting = m) }] : []),
      ...(canAct ? [{ icon: UserX, label: "Remove from the group", destructive: true, onSelect: () => (removing = m) }] : []),
    ];
  });
  const staff = $derived(shown.filter((m) => m.role !== "Member"));
  const regular = $derived(shown.filter((m) => m.role === "Member"));
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
    <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
  {:else}
    {#if members.length > 8}
      <label class="mx-4 my-2.5 flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-muted-foreground">
        <Search class="size-4" /><input bind:value={query} placeholder="Search members" aria-label="Search members" class="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
    {/if}
    {#if requests.length}
      <h2 class="px-4 pb-1 pt-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asked to join · {requests.length}</h2>
      <ul class="mb-3">
        {#each requests as r (r.user.id)}
          <li class="flex min-h-16 items-center gap-3 border-b border-border px-4">
            <a href="/social/{r.user.username}" class="flex min-w-0 flex-1 items-center gap-3 py-2 text-inherit no-underline">
              <PersonAvatar name={r.user.displayName} src={r.user.avatarUrl} size={40} />
              <span class="flex min-w-0 flex-col"><span class="truncate text-[15px] font-medium">{r.user.displayName}</span><span class="truncate text-[12px] text-muted-foreground">@{r.user.username}{r.followedBy ? ` · followed by ${r.followedBy}` : ""}</span></span>
            </a>
            <button type="button" class="h-9 shrink-0 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground" onclick={() => answer(r, true)}>Approve</button>
            <button type="button" class="h-9 shrink-0 rounded-lg border border-border px-3 text-[13px] font-semibold" onclick={() => answer(r, false)}>Decline</button>
          </li>
        {/each}
      </ul>
      <h2 class="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</h2>
    {/if}
    {#snippet person(m: GroupMember)}
        {@const mine = m.user.username === me}
        <li class="flex min-h-14 items-center gap-3 border-b border-border px-4">
          <a href={mine ? "/profile" : `/social/${m.user.username}`} class="flex min-w-0 flex-1 items-center gap-3 py-2 text-inherit no-underline">
            <PersonAvatar name={m.user.displayName} src={m.user.avatarUrl} size={40} />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-[15px] font-medium">{mine ? "You" : m.user.displayName || m.user.username}</span>
              <span class="truncate text-[12px] text-muted-foreground">{roleText(m)}</span>
            </span>
          </a>
          {#if !mine}<button type="button" aria-label="Options for {m.user.displayName}" class="flex size-11 shrink-0 items-center justify-center text-muted-foreground" onclick={() => (picked = m)}><MoreHorizontal class="size-5" /></button>{/if}
        </li>
      {/snippet}
    {#if staff.length && regular.length}<h2 class="px-4 pb-1 pt-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organisers and moderators</h2>{/if}
    <ul>{#each staff as m (m.user.id)}{@render person(m)}{/each}</ul>
    {#if staff.length && regular.length}<h2 class="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</h2>{/if}
    <ul>{#each regular as m (m.user.id)}{@render person(m)}{/each}</ul>
    {#if shown.length === 0}<p class="px-4 py-8 text-center text-sm text-muted-foreground">Nobody by that name.</p>{/if}
  {/if}
</div>

<ActionSheet open={!!picked} onOpenChange={(v) => { if (!v) picked = null; }} title={picked ? `${picked.user.displayName} · @${picked.user.username}` : ""} items={actions} />
<ActionSheet
  open={!!muting}
  onOpenChange={(v) => { if (!v) muting = null; }}
  title={muting ? `Mute ${muting.user.displayName} in the chat` : ""}
  items={muteItems(muting, (m, min) => void mute(m, min))}
/>
<ConfirmDialog
  open={!!removing}
  onOpenChange={(v) => { if (!v) removing = null; }}
  title="Remove {removing?.user.displayName ?? ''}?"
  description="They're taken out of the group and its chat. They can join again with the link unless you reset it."
  confirmLabel="Remove"
  onConfirm={remove}
/>
{#if inviting && group}<GroupInviteSheet groupId={group.id} name={group.name} code={group.inviteCode} onclose={() => (inviting = false)} />{/if}
