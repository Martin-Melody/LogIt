<!-- New group (design canvas G6, from Messages) and Edit group (G8): name, what it is, where, an
     optional photo, who can find and join it (G11), and questions for people asking (K8). Whoever makes it is its organiser. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { Camera, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc, uploadPhoto } from "@logit/core/api/photosApi";
  import { GROUP_KINDS, groupsApi, type Group, type GroupAccess, type GroupKind } from "@logit/core/api/groupsApi";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import { Input } from "$lib/components/ui/input";
  import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";
  import type { AskQuestion } from "@logit/core/domain/coachRequest";
  import JoinQuestionsEditor from "./JoinQuestionsEditor.svelte";

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
  let saving = $state(false);
  // Canvas K8: questions for people asking to join (only when it asks for approval).
  // svelte-ignore state_referenced_locally
  let questions = $state<AskQuestion[]>(group?.joinQuestions ?? []);
  const cleanQuestions = () =>
    questions
      .map((q) => ({ ...q, label: q.label.trim(), options: q.kind === "choice" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : null }))
      .filter((q) => q.label);
  const accessOptions: { value: GroupAccess; label: string; note: string }[] = [
    { value: "InviteOnly", label: "Invite only", note: "Hidden from search. Join with the link, the QR or a member's invite" },
    { value: "Request", label: "Anyone can find it, ask to join", note: "In search; an organiser approves each request" },
    { value: "Open", label: "Anyone can find it and join", note: "In search; no approval" },
  ];
  const changedPhoto = $derived(photo !== (group?.photoUrl ?? null));

  async function choose() {
    const chosen = await choosePhoto({ title: "Group photo", crop: { aspect: 1 }, maxPx: 1024, canRemove: !!photo });
    if (chosen) photo = "photo" in chosen ? chosen.photo : null;
  }

  async function save() {
    if (!name.trim()) return;
    saving = true;
    try {
      const photoId = changedPhoto && photo ? (await uploadPhoto(photo)).id : undefined;
      const joinQuestions = access === "Request" ? cleanQuestions() : undefined;
      let saved = group
        ? await groupsApi.edit(group.id, { name: name.trim(), kind, place: place.trim(), photoId, removePhoto: changedPhoto && !photo, access, joinQuestions })
        : await groupsApi.create({ name: name.trim(), kind, place: place.trim() || null, photoId, access });
      // A new group gets its questions once it exists.
      if (!group && joinQuestions?.length) saved = await groupsApi.edit(saved.id, { joinQuestions });
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
      {#if access === "Request"}
        <div class="mt-2 flex flex-col gap-2">
          <span class="text-[13px] font-medium">Questions when someone asks (optional)</span>
          <span class="text-[12px] leading-snug text-muted-foreground">Asked of everyone who asks to join. Only organisers and moderators see the answers.</span>
          <JoinQuestionsEditor bind:questions />
        </div>
      {/if}
      <span class="text-[12px] text-muted-foreground">Invites from members always work. {access === "InviteOnly" ? "Forum posts labelled with the group stay inside it." : "Forum posts labelled with the group are public, like the rest of the Forum."}</span>
    </div>
    {#if !group}
      <p class="text-[13px] leading-relaxed text-muted-foreground">You're the organiser. People join with the group's link or QR, which you share next. Members see each other's names and photos, never workouts or weights.</p>
    {/if}
    <button type="submit" disabled={saving || !name.trim()} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">{group ? "Save" : "Create group"}</button>
  </form>
</BottomSheet>
