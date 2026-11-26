<!-- A public account in a list (canvas S3): photo, name, @name and bio; Follow asks to sign in. -->
<script lang="ts">
  import { ask } from "./prompt.svelte";
  import { photoUrl } from "./publicApi";

  const { person, api }: { person: { username: string; displayName: string; avatarUrl: string | null; bio: string | null }; api: string } = $props();
  const name = $derived(person.displayName || person.username);
</script>

<div class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
  <a href="/@{person.username}" class="flex min-w-0 flex-1 items-center gap-3">
    <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold">{#if photoUrl(api, person.avatarUrl)}<img src={photoUrl(api, person.avatarUrl)} alt="" class="size-full object-cover" />{:else}{name.charAt(0).toUpperCase()}{/if}</span>
    <span class="flex min-w-0 flex-col"><span class="truncate font-semibold text-heading">{name}</span><span class="truncate text-sm text-muted-foreground">@{person.username}{person.bio ? ` · ${person.bio}` : ""}</span></span>
  </a>
  <button type="button" class="h-9 shrink-0 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted" onclick={() => ask("follow", name)}>Follow</button>
</div>
