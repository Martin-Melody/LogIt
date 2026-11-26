<!-- A group invite in a chat (design canvas G16): the group's face and Join, which opens the
     join screen ("Invited by …", "Show me on the board"). -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import type { readGroupInvite } from "@logit/core/domain/messageCard";
  import GroupAvatar from "./GroupAvatar.svelte";

  const { invite, mine = false }: { invite: NonNullable<ReturnType<typeof readGroupInvite>>; mine?: boolean } = $props();
</script>

<div class="flex w-64 max-w-full flex-col gap-2.5 rounded-2xl border border-border bg-card p-3">
  <span class="text-[12px] text-muted-foreground">{mine ? "You sent an invite to a group" : "Invited you to a group"}</span>
  <span class="flex items-center gap-2.5">
    <GroupAvatar name={invite.name} src={invite.photoUrl} size={44} />
    <span class="flex min-w-0 flex-col">
      <span class="truncate text-[15px] font-semibold">{invite.name}</span>
      <span class="truncate text-[12px] text-muted-foreground">{[invite.kind, invite.place, `${invite.members} ${invite.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}</span>
    </span>
  </span>
  <button type="button" class="h-10 rounded-lg text-sm font-semibold {mine ? 'border border-border' : 'bg-primary text-primary-foreground'}"
    onclick={() => void goto(`/groups/join?id=${invite.groupId}`)}>{mine ? "View group" : "Join"}</button>
</div>
