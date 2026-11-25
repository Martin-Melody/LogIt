<!-- New group (design canvas G6, from Messages) and Edit group (G8): name, what it is, where, an
     optional photo, and who can find and join it (G11). Whoever makes it is its organiser. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { Camera, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc, uploadPhoto } from "@logit/core/api/photosApi";
  import { GROUP_KINDS, groupsApi, type Group, type GroupAccess, type GroupKind, type WhoCanPost } from "@logit/core/api/groupsApi";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import { Input } from "$lib/components/ui/input";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";

  const { group = null, onclose, onsaved }: { group?: Group | null; onclose: () => void; onsaved?: (g: Group) => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(group?.name ?? "");
  // svelte-ignore state_referenced_locally
  let kind = $state<GroupKind>(group?.kind ?? "Gym");
  // svelte-ignore state_referenced_locally
  let place = $state(group?.place ?? "");
  /** A new picture (data URL), or the group's current one, or none. */
  // svelte-ignore state_referenced_locally
  let photo = $state<string | null>(group?.photoUrl ?? null);
  // svelte-ignore state_referenced_locally
  let access = $state<GroupAccess>(group?.access ?? "InviteOnly");
  // svelte-ignore state_referenced_locally
  let postsOn = $state(group?.posts?.on ?? true);
  // svelte-ignore state_referenced_locally
  let whoCanPost = $state<WhoCanPost>(group?.posts?.whoCanPost ?? "Anyone");
  // svelte-ignore state_referenced_locally
  let whoCanComment = $state<"Anyone" | "Members">(group?.posts?.whoCanComment ?? "Anyone");
  // svelte-ignore state_referenced_locally
  let postsOnWeb = $state(group?.posts?.onWeb ?? false);
  let saving = $state(false);
  const accessOptions: { value: GroupAccess; label: string; note: string }[] = [
    { value: "InviteOnly", label: "Invite only", note: "Hidden from search. Join with the link, the QR or a member's invite" },
    { value: "Request", label: "Anyone can find it, ask to join", note: "In search; an organiser approves each request" },
    { value: "Open", label: "Anyone can find it and join", note: "In search; no approval" },
  ];
  const changedPhoto = $derived(photo !== (group?.photoUrl ?? null));

  async function choose() {
    try {
      photo = await resizeImageFile(await pickImageFile(), 1024, 0.85);
    } catch {
      // cancelled
    }
  }

  async function save() {
    if (!name.trim()) return;
    saving = true;
    try {
      const photoId = changedPhoto && photo ? (await uploadPhoto(photo)).id : undefined;
      const saved = group
        ? await groupsApi.edit(group.id, { name: name.trim(), kind, place: place.trim(), photoId, removePhoto: changedPhoto && !photo, access,
            postsOn, whoCanPost, whoCanComment, postsOnWeb: postsOnWeb && access !== "InviteOnly" })
        : await groupsApi.create({ name: name.trim(), kind, place: place.trim() || null, photoId, access });
      onsaved?.(saved);
      onclose();
      if (!group) await goto(`/groups/${saved.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't save the group. Check your connection and try again.");
    } finally {
      saving = false;
    }
  }
</script>

<BottomSheet label={group ? "Edit group" : "New group"} {onclose} tall>
  <form class="flex flex-col gap-4 px-4 pb-2" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <h2 class="text-[19px] font-semibold">{group ? "Edit group" : "New group"}</h2>
    <div class="flex items-center gap-3.5">
      <span class="relative shrink-0">
        <button type="button" aria-label={photo ? "Change the group's photo" : "Add a group photo"} onclick={choose}
          class="flex size-[72px] items-center justify-center overflow-hidden rounded-[18px] bg-muted text-muted-foreground {photo ? '' : 'border border-dashed border-border'}">
          {#if photo}<img src={photoSrc(photo)} alt="" class="size-full object-cover" />{:else}<Camera class="size-6" />{/if}
        </button>
        {#if photo}
          <button type="button" aria-label="Remove the photo" onclick={() => (photo = null)}
            class="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-border bg-background"><X class="size-3.5" /></button>
        {/if}
      </span>
      <span class="text-[13px] leading-snug text-muted-foreground">A photo or the gym's logo (optional). Without one, the group shows its initials.</span>
    </div>
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Name</span>
      <Input bind:value={name} maxlength={60} placeholder="Iron Club" class="h-12 text-[15px]" />
    </label>
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-medium" id="group-kind">What is it?</span>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="group-kind">
        {#each GROUP_KINDS as k (k)}
          <button type="button" role="radio" aria-checked={kind === k} class={chip(kind === k)} onclick={() => (kind = k)}>{k}</button>
        {/each}
      </div>
    </div>
    <label class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Where (optional)</span>
      <Input bind:value={place} maxlength={60} placeholder="Dublin 8" class="h-12 text-[15px]" />
      <span class="text-[12px] text-muted-foreground">Shown under the name. A full address can go in the pinned note.</span>
    </label>
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-medium">Who can find and join it?</span>
      <RadioGroup.Root value={access} aria-label="Who can find and join it?" onValueChange={(v) => (access = v as GroupAccess)} class="overflow-hidden rounded-xl border border-border">
        {#each accessOptions as o (o.value)}
          <label class="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px]">{o.label}</span><span class="text-[12px] leading-snug text-muted-foreground">{o.note}</span></span>
            <RadioGroup.Item value={o.value} />
          </label>
        {/each}
      </RadioGroup.Root>
      <span class="text-[12px] text-muted-foreground">Invites from members always work.</span>
    </div>
    {#if group}
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-medium">Posts</span>
        <div class="overflow-hidden rounded-xl border border-border">
          <div class="flex min-h-14 items-center gap-3 border-b border-border py-1.5 pl-3 pr-1.5"><span class="flex flex-1 flex-col"><span class="text-[15px]">Posts</span><span class="text-[12px] text-muted-foreground">A Posts tab for threads, next to the chat</span></span><Switch checked={postsOn} label="Posts" onchange={(v) => (postsOn = v)} /></div>
          {#if postsOn}
            <div class="flex flex-col gap-2 border-b border-border px-3 py-2.5"><span class="text-[15px]">Who can post</span>
              <div class="flex flex-wrap gap-2">{#each [["Anyone", "Anyone on LogIt"], ["Members", "Members only"], ["Staff", "Organisers and moderators"]] as [v, l] (v)}<button type="button" class={chip(whoCanPost === v)} aria-pressed={whoCanPost === v} onclick={() => (whoCanPost = v as WhoCanPost)}>{l}</button>{/each}</div>
              <span class="text-[12px] text-muted-foreground">People outside the group show as not a member.</span></div>
            <div class="flex flex-col gap-2 border-b border-border px-3 py-2.5"><span class="text-[15px]">Who can comment</span>
              <div class="flex flex-wrap gap-2">{#each [["Anyone", "Anyone on LogIt"], ["Members", "Members only"]] as [v, l] (v)}<button type="button" class={chip(whoCanComment === v)} aria-pressed={whoCanComment === v} onclick={() => (whoCanComment = v as "Anyone" | "Members")}>{l}</button>{/each}</div>
              <span class="text-[12px] text-muted-foreground">A post can keep its own comments to members.</span></div>
            <div class="flex min-h-16 items-center gap-3 py-1.5 pl-3 pr-1.5"><span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px]">Show posts on the web</span><span class="text-[12px] leading-snug text-muted-foreground">{access === "InviteOnly" ? "Only for groups anyone can find." : "Anyone can read posts written from now on at getlogit.app and find them on Google. Off takes them all off the web."}</span></span>
              <Switch checked={postsOnWeb && access !== "InviteOnly"} disabled={access === "InviteOnly"} label="Show posts on the web" onchange={(v) => (postsOnWeb = v)} /></div>
          {/if}
        </div>
      </div>
    {/if}
    {#if !group}
      <p class="text-[13px] leading-relaxed text-muted-foreground">You're the organiser. People join with the group's link or QR, which you share next. Members see each other's names and photos, never workouts or weights.</p>
    {/if}
    <button type="submit" disabled={saving || !name.trim()} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">{group ? "Save" : "Create group"}</button>
  </form>
</BottomSheet>
