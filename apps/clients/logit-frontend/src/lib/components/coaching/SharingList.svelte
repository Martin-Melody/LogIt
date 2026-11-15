<script lang="ts">
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { SHARE_AREAS, type ShareArea, type Sharing } from "@logit/core/api/coachApi";

  // "What your coach can see": one switch per kind of data. Same list as the web's My coach.

  const { sharing, disabled = false, onchange }: { sharing: Sharing; disabled?: boolean; onchange: (next: Sharing) => void } = $props();

  function flip(key: ShareArea, on: boolean) {
    onchange({ ...sharing, [key]: on });
  }
</script>

<ul class="divide-y divide-border">
  {#each SHARE_AREAS as a (a.key)}
    <li class="flex items-center justify-between gap-3 px-3 text-sm">
      <span>{a.label}</span>
      <Switch checked={sharing[a.key]} label={a.label} {disabled} onchange={(v) => flip(a.key, v)} />
    </li>
  {/each}
  <li class="flex items-center justify-between gap-3 px-3 py-3 text-sm">
    <span class="text-muted-foreground">Social posts and other messages</span>
    <span class="text-xs text-muted-foreground">Never</span>
  </li>
</ul>
