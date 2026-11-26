<script lang="ts">
  import { publishPhoto } from "@logit/core/api/photosApi";
  import { flip } from "svelte/animate";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type ApiProfile } from "@logit/core/api/socialApi";
  import { apiClient } from "@logit/core/api/client";
  import ImageCropper from "@logit/ui/ImageCropper.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { createReorder, SLIDE_MS } from "$lib/reorder.svelte";
  import Avatar from "./Avatar.svelte";
  import ProfileCardBody from "./ProfileCardBody.svelte";
  import { CARD_BY_ID, CARD_TITLE, orderedWidgets, parseProfileData } from "./profileCards";

  /**
   * Your own profile in edit mode: photo, name, bio, and which cards show in what order.
   * Saved to your account's profile; the phone takes it from there the next time it syncs.
   * The cards' numbers still come from the phone's snapshot.
   */
  let { profile, oncancel, onsaved }: { profile: ApiProfile; oncancel: () => void; onsaved: (p: ApiProfile) => void } = $props();

  const BIO_MAX = 160;
  const AVATAR_PX = 512;

  // svelte-ignore state_referenced_locally
  const start = profile;
  const data = parseProfileData(start.publicProfileJson);
  let name = $state(start.displayName);
  let bio = $state(start.bio ?? "");
  let avatar = $state<string | null>(start.avatarUrl || null);
  let saving = $state(false);

  const widgets = data ? orderedWidgets(data) : [];
  let shown = $state<string[]>(widgets.filter((w) => w.enabled).map((w) => w.id));
  let hiddenIds = $state<string[]>(widgets.filter((w) => !w.enabled).map((w) => w.id));

  const reorder = createReorder<string>("grid");

  function dropCards(e: DragEvent) {
    const order = reorder.drop(e);
    if (order) shown = order;
  }

  function moveBy(id: string, by: -1 | 1) {
    const i = shown.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[i], next[j]] = [next[j]!, next[i]!];
    shown = next;
  }

  function onGripKey(e: KeyboardEvent, id: string) {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); moveBy(id, -1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); moveBy(id, 1); }
  }

  function hide(id: string) {
    shown = shown.filter((x) => x !== id);
    hiddenIds = [...hiddenIds, id];
  }

  function show(id: string) {
    hiddenIds = hiddenIds.filter((x) => x !== id);
    shown = [...shown, id];
  }

  // Picked photos go through the cropper (design canvas U6) and come out 512 px square.
  let cropSrc = $state<string | null>(null);
  let cropper = $state<ReturnType<typeof ImageCropper> | null>(null);

  function pickPhoto(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That isn't a photo");
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    cropSrc = URL.createObjectURL(file);
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    cropSrc = null;
  }

  async function useCrop() {
    try {
      avatar = await cropper!.result(AVATAR_PX, 0.82);
      closeCrop();
    } catch {
      toast.error("Couldn't read that image");
    }
  }

  async function save() {
    const displayName = name.trim();
    if (!displayName) {
      toast.error("Your name can't be empty");
      return;
    }
    saving = true;
    // Every card the snapshot knows, shown ones first in their new order.
    const nextWidgets = data
      ? [...shown.map((id) => ({ id, enabled: true })), ...hiddenIds.map((id) => ({ id, enabled: false }))].map((w, i) => ({ ...w, order: i }))
      : null;
    try {
      // Uploaded once as a server photo; the phone gets the address through its profile too.
      avatar = await publishPhoto(avatar);
      const updated = await socialApi.updateMe({
        displayName,
        bio: bio.trim(),
        avatarUrl: avatar ?? "",
        ...(data && nextWidgets ? { publicProfileJson: JSON.stringify({ ...data, widgets: nextWidgets }) } : {}),
      });
      apiClient.rememberDisplayName(updated.displayName);
      toast.success("Profile saved");
      onsaved(updated);
    } catch {
      toast.error("Couldn't save your profile");
    } finally {
      saving = false;
    }
  }
</script>

<div class="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-primary px-4 py-3 text-primary-foreground">
  <span class="text-sm font-semibold">Editing your profile · people see the changes when you save</span>
  <div class="flex gap-2">
    <button type="button" class="h-8 rounded-[9px] border border-primary-foreground/30 px-3 text-sm" onclick={oncancel} disabled={saving}>Cancel</button>
    <button type="button" class="h-8 rounded-[9px] bg-primary-foreground px-3.5 text-sm font-semibold text-primary disabled:opacity-60" onclick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
  </div>
</div>

<section aria-label="Name, photo and bio" class="flex flex-wrap items-start gap-[22px] rounded-[10px] border border-border bg-card px-[22px] py-5">
  <div class="flex flex-col items-center gap-2">
    <Avatar name={name} url={avatar} size={88} />
    <label class="flex h-8 cursor-pointer items-center rounded-[9px] border border-border px-3 text-xs font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
      Change photo
      <input type="file" accept="image/*" class="sr-only" onchange={pickPhoto} />
    </label>
    {#if avatar}
      <button type="button" class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (avatar = null)}>Remove</button>
    {/if}
  </div>
  <div class="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label for="pe-name" class="text-xs font-medium text-muted-foreground">Name</label>
      <input id="pe-name" bind:value={name} maxlength="60" autocomplete="name"
        class="h-[38px] max-w-[360px] rounded-[9px] border border-input bg-background px-3 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-ring" />
      <span class="text-xs text-muted-foreground">@{profile.username}</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="pe-bio" class="text-xs font-medium text-muted-foreground">Bio</label>
      <textarea id="pe-bio" bind:value={bio} rows="3" maxlength={Math.max(BIO_MAX, start.bio?.length ?? 0)} placeholder="Something about yourself"
        class="resize-y rounded-[9px] border border-input bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"></textarea>
      <span class="self-end text-xs {bio.length > BIO_MAX ? 'text-warning' : 'text-muted-foreground'}">{bio.length} / {BIO_MAX}</span>
    </div>
  </div>
</section>

<div class="flex flex-wrap items-baseline justify-between gap-2">
  <h2 class="text-[15px] font-semibold">Cards on your profile</h2>
  {#if data}
    <span class="text-xs text-muted-foreground">Drag to reorder. The numbers come from your phone and update after each workout or weigh-in.</span>
  {/if}
</div>

{#if !data}
  <p class="rounded-[10px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
    Your cards come from the app. Open your profile in LogIt on your phone once and they'll show up here.
  </p>
{:else}
  {#if shown.length}
    <div role="list" aria-label="Cards people see" class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5"
      ondragenter={(e) => reorder.allow(e)} ondragover={(e) => reorder.allow(e)} ondrop={dropCards}>
      {#each reorder.arrange(shown, (id) => id) as id (id)}
        {@const kind = CARD_BY_ID[id]!}
        {@const isGap = reorder.held === id}
        <section role="listitem" aria-label={CARD_TITLE[kind]} draggable="true"
          animate:flip={{ duration: SLIDE_MS }}
          ondragstart={(e) => reorder.start(shown, id, e)}
          ondragend={() => reorder.end()}
          ondragover={(e) => reorder.over(id, e)}
          class="relative flex min-h-[132px] min-w-0 cursor-grab flex-col gap-2 rounded-[10px] px-4 py-3.5
            {isGap ? 'border-[1.5px] border-dashed border-primary bg-primary/5 [&>*:not(.drop-label)]:invisible' : 'border-[1.5px] border-dashed border-primary/40 bg-card'}">
          {#if isGap}
            <span class="drop-label absolute inset-0 flex items-center justify-center text-[13px] text-primary">{CARD_TITLE[kind]} lands here</span>
          {/if}
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{CARD_TITLE[kind]}</h3>
            <span class="flex gap-1">
              <button type="button" class="h-7 rounded-[7px] border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground" onclick={() => hide(id)}>Hide</button>
              <button type="button" aria-label="Move {CARD_TITLE[kind]} (arrow keys)" onkeydown={(e) => onGripKey(e, id)}
                class="flex size-7 cursor-grab items-center justify-center rounded-[7px] border border-border text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"><GripVerticalIcon class="size-3.5" /></button>
            </span>
          </div>
          <ProfileCardBody {data} {kind} name={name} />
        </section>
      {/each}
    </div>
  {:else}
    <p class="rounded-[10px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No cards on your profile. Show one below.</p>
  {/if}

  {#if hiddenIds.length}
    <div class="flex flex-col gap-2">
      <span class="text-xs text-muted-foreground">Hidden from your profile</span>
      <div class="flex flex-wrap gap-2">
        {#each hiddenIds as id (id)}
          <span class="flex h-9 items-center gap-2 rounded-[9px] border border-dashed border-border pl-3 pr-1.5 text-[13px] text-muted-foreground">
            {CARD_TITLE[CARD_BY_ID[id]!]}
            <button type="button" class="h-[26px] rounded-[7px] border border-border px-2.5 text-xs text-foreground hover:bg-muted" onclick={() => show(id)}>Show</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<Dialog.Root open={!!cropSrc} onOpenChange={(o) => { if (!o) closeCrop(); }}>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[460px]">
    <Dialog.Header class="px-5 pt-4 pb-3">
      <Dialog.Title>Profile photo</Dialog.Title>
      <Dialog.Description>Drag or use the arrow keys to move it, scroll or use the slider to zoom. The circle is what everyone sees.</Dialog.Description>
    </Dialog.Header>
    {#if cropSrc}
      <ImageCropper bind:this={cropper} src={cropSrc} aspect={1} round class="h-[420px]" />
    {/if}
    <Dialog.Footer class="px-5 pt-2 pb-4">
      <button type="button" class="h-9 rounded-[9px] border border-border px-3.5 text-sm" onclick={closeCrop}>Cancel</button>
      <button type="button" class="h-9 rounded-[9px] bg-primary px-3.5 text-sm font-semibold text-primary-foreground" onclick={useCrop}>Use photo</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
