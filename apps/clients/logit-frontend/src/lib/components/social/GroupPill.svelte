<!-- The group a forum post is labelled with (design canvas F2): its photo or initials and name. -->
<script lang="ts">
  import { photoSrc } from "@logit/core/api/photosApi";

  const { group }: { group: { name: string; photoUrl: string | null } } = $props();
</script>

<span class="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
  {#if group.photoUrl}<img src={photoSrc(group.photoUrl)} alt="" class="size-3.5 shrink-0 rounded object-cover" />
  {:else}<span aria-hidden="true" class="flex size-3.5 shrink-0 items-center justify-center rounded bg-muted text-[7px] font-bold">{group.name.slice(0, 2).toUpperCase()}</span>{/if}
  <span class="truncate">{group.name}</span>
</span>
