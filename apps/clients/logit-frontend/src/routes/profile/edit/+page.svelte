<!-- Edit profile (design canvas PR2): one place for everything on your profile. Photo, name and
     bio; which training cards show and in what order (was Customise profile); the numbers the
     cards use; and who can see it all. Every change is saved as it's made. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { goto } from "$app/navigation";
  import { ChevronRight, GripVertical } from "lucide-svelte";
  import { dragHandleZone, dragHandle } from "svelte-dnd-action";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { socialApi } from "@logit/core/api/socialApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ProfileAvatar from "$lib/components/ProfileAvatar.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { back } from "$lib/navigation";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { profileConfig } from "$lib/stores/profileConfig.store";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
  import { saveProfile, syncOwnProfile } from "$lib/features/profileWidgets/publicProfileSync";
  import { choosePhoto } from "$lib/features/photos/photoChooser.svelte";

  const NAME_MAX = 60;
  const BIO_MAX = 160;
  const FLIP_MS = 150;

  const defs = localProfileWidgetRegistry.list();
  type Row = { id: string; enabled: boolean };
  let rows = $state<Row[]>([]);
  // The list follows the store, except mid-drag.
  let dragging = false;
  $effect(() => {
    const slots = [...$profileConfig.slots].sort((a, b) => a.orderIndex - b.orderIndex);
    if (!dragging) rows = slots.filter((s) => defs.some((d) => d.id === s.id)).map((s) => ({ id: s.id, enabled: s.enabled }));
  });

  function saveRows(next: Row[]) {
    rows = next;
    void saveProfile({ slots: next.map((r, i) => ({ id: r.id, enabled: r.enabled, orderIndex: i })) });
  }

  let editing = $state<null | "name" | "bio" | "height">(null);
  let draft = $state("");
  let isPrivate = $state<boolean | null>(null);

  onMount(() => {
    const me = authStore.user?.username;
    if (me) socialApi.getProfile(me).then((p) => (isPrivate = !!p.isPrivate)).catch(() => {});
  });

  function open(field: "name" | "bio" | "height") {
    draft = field === "name" ? $profile.name : field === "bio" ? $profile.bio : $profile.height != null ? String($profile.height) : "";
    editing = field;
  }

  const draftOk = $derived(
    editing === "name" ? draft.trim().length > 0 && draft.trim().length <= NAME_MAX
    : editing === "bio" ? draft.trim().length <= BIO_MAX
    : editing === "height" ? draft.trim() === "" || (Number(draft) > 0 && Number(draft) < 300)
    : false,
  );

  function saveField() {
    if (!draftOk) return;
    if (editing === "name") void saveProfile({ name: draft.trim() });
    else if (editing === "bio") void saveProfile({ bio: draft.trim() });
    else if (editing === "height") {
      profile.save({ height: draft.trim() === "" ? null : Math.round(Number(draft) * 10) / 10 });
      void syncOwnProfile();
    }
    editing = null;
  }

  async function progressPhoto() {
    const chosen = await choosePhoto({ title: "Progress photo", crop: { aspect: 1 }, maxPx: 1024, canRemove: !!$profile.progressPhotoDataUrl });
    if (!chosen) return;
    profile.save({ progressPhotoDataUrl: "photo" in chosen ? chosen.photo : "" });
    void syncOwnProfile();
  }
</script>

{#snippet row(label: string, value: string, onclick: (() => void) | null, muted = false)}
  {#if onclick}
    <button type="button" class="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left" {onclick}>
      <span class="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span class="min-w-0 flex-1 truncate text-[15px] {muted ? 'text-muted-foreground' : ''}">{value}</span>
      <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </button>
  {:else}
    <div class="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
      <span class="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span class="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">{value}</span>
    </div>
  {/if}
{/snippet}

{#snippet group(title: string, note: string | null, body: import("svelte").Snippet)}
  <section class="px-3">
    <h2 class="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
    <div class="divide-y divide-border rounded-xl border border-border bg-card">{@render body()}</div>
    {#if note}<p class="px-1 pt-1.5 text-xs leading-normal text-muted-foreground">{note}</p>{/if}
  </section>
{/snippet}

<div class="flex flex-col gap-5 pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/profile")} />
    <h1 class="page-title">Edit profile</h1>
  </PageHeader>

  <div class="flex flex-col items-center gap-2.5">
    <ProfileAvatar name={$profile.name} avatarDataUrl={$profile.avatarDataUrl} editable class="size-[84px]" />
    <span class="text-xs text-muted-foreground">Tap to change</span>
  </div>

  {#snippet about()}
    {@render row("Name", $profile.name || "Add your name", () => open("name"), !$profile.name)}
    {#if authStore.user}{@render row("Username", `@${authStore.user.username}`, null)}{/if}
    {@render row("Bio", $profile.bio || "Add a bio", () => open("bio"), !$profile.bio)}
  {/snippet}
  {@render group("About you", null, about)}

  {#snippet cards()}
    <ul
      class="divide-y divide-border"
      aria-label="Training tab cards"
      use:dragHandleZone={{ items: rows, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
      onconsider={(e) => { dragging = true; rows = e.detail.items; }}
      onfinalize={(e) => { dragging = false; saveRows(e.detail.items); }}
    >
      {#each rows as r (r.id)}
        {@const def = defs.find((d) => d.id === r.id)}
        <li class="flex items-center gap-2.5 bg-card py-1.5 pr-3.5 pl-1.5" animate:flip={{ duration: FLIP_MS }}>
          <span use:dragHandle aria-label="Drag {def?.label} to reorder" class="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"><GripVertical class="size-[18px]" /></span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-medium">{def?.label}</span>
            <span class="text-[13px] leading-snug text-muted-foreground">{def?.description}</span>
          </span>
          <Switch checked={r.enabled} label="Show {def?.label}" onchange={(v) => saveRows(rows.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))} />
        </li>
      {/each}
    </ul>
  {/snippet}
  {@render group("Training tab", "Drag to change the order.", cards)}

  {#snippet numbers()}
    {@render row("Height", $profile.height != null ? `${$profile.height} ${$profile.heightUnit}` : "Add your height", () => open("height"), $profile.height == null)}
    {@render row("Weight", $profile.weight != null ? `${$profile.weight} ${$profile.weightUnit}` : "Log a weigh-in", () => void goto("/nutrition/weight"), $profile.weight == null)}
    <button type="button" class="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left" onclick={progressPhoto}>
      <span class="w-24 shrink-0 text-sm text-muted-foreground">Progress photo</span>
      {#if $profile.progressPhotoDataUrl}
        <img src={photoSrc($profile.progressPhotoDataUrl)} alt="" class="size-10 rounded-md object-cover" />
        <span class="flex-1"></span>
      {:else}
        <span class="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">Choose a photo</span>
      {/if}
      <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </button>
  {/snippet}
  {@render group("Used by your cards", "Weight comes from your weigh-ins in Nutrition.", numbers)}

  {#if authStore.isAuthenticated}
    {#snippet who()}
      {@render row("Account", isPrivate === null ? "…" : isPrivate ? "Private: followers you accept" : "Public: anyone, here and on getlogit.app", () => void goto("/settings/privacy"))}
    {/snippet}
    {@render group("Who sees it", null, who)}
  {/if}
</div>

{#if editing}
  <BottomSheet label={editing === "name" ? "Name" : editing === "bio" ? "Bio" : "Height"} onclose={() => (editing = null)}>
    <form class="flex flex-col gap-3 px-4 pb-2" onsubmit={(e) => { e.preventDefault(); saveField(); }}>
      <h2 class="text-[17px] font-semibold">{editing === "name" ? "Name" : editing === "bio" ? "Bio" : "Height"}</h2>
      {#if editing === "bio"}
        <Textarea bind:value={draft} rows={4} maxlength={Math.max(BIO_MAX, $profile.bio.length)} placeholder="Something about yourself" class="text-[15px]" />
        <span class="self-end text-xs {draft.trim().length > BIO_MAX ? 'text-destructive' : 'text-muted-foreground'}">{draft.trim().length} / {BIO_MAX}</span>
      {:else if editing === "name"}
        <Input bind:value={draft} maxlength={NAME_MAX} autocomplete="name" class="h-12 text-[15px]" />
      {:else}
        <label class="flex items-center gap-2">
          <Input bind:value={draft} type="number" inputmode="decimal" step="0.1" min="0" class="h-12 text-[15px]" aria-label="Height in {$profile.heightUnit}" />
          <span class="text-sm text-muted-foreground">{$profile.heightUnit}</span>
        </label>
      {/if}
      <Button type="submit" class="h-11" disabled={!draftOk}>Save</Button>
    </form>
  </BottomSheet>
{/if}
