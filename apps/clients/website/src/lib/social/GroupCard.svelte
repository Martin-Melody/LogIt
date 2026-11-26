<!-- A group anyone can find, in a list (canvas S3, Groups): photo, name, kind, place, members. -->
<script lang="ts">
  import { photoUrl } from "./publicApi";

  const { group, api }: { group: { name: string; kind: string; place: string | null; photoUrl: string | null; members: number; webPath: string }; api: string } = $props();
  const initials = $derived(group.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join(""));
</script>

<a href={group.webPath} class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 sm:px-5">
  <span class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-bold text-heading">{#if photoUrl(api, group.photoUrl)}<img src={photoUrl(api, group.photoUrl)} alt="" class="size-full object-cover" />{:else}{initials}{/if}</span>
  <span class="flex min-w-0 flex-1 flex-col"><span class="truncate font-semibold text-heading">{group.name}</span><span class="truncate text-sm text-muted-foreground">{[group.kind, group.place, `${group.members} ${group.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}</span></span>
</a>
