<script lang="ts">
  import { SHARE_AREAS, type ShareArea, type Sharing } from "@logit/core/api/coachApi";

  // The "what your coach can see" switches. Used when asking a coach (invite link), when
  // accepting an invite, and in My coach.

  let { sharing, disabled = false, onchange }: {
    sharing: Sharing;
    disabled?: boolean;
    onchange: (next: Sharing) => void;
  } = $props();

  function flip(key: ShareArea) {
    onchange({ ...sharing, [key]: !sharing[key] });
  }
</script>

<div class="flex flex-col">
  {#each SHARE_AREAS as a (a.key)}
    <div class="flex items-center justify-between gap-2.5 border-t border-border py-2.5 text-[13px]">
      <span id="share-{a.key}">{a.label}</span>
      <button type="button" role="switch" aria-checked={sharing[a.key]} aria-labelledby="share-{a.key}" {disabled} onclick={() => flip(a.key)}
        class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 {sharing[a.key] ? 'bg-success' : 'bg-muted-foreground/30'}">
        <span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {sharing[a.key] ? 'right-0.5' : 'left-0.5'}"></span>
      </button>
    </div>
  {/each}
  <div class="flex items-center justify-between gap-2.5 border-t border-border py-2.5 text-[13px]">
    <span class="text-muted-foreground">Social posts and other messages</span>
    <span class="text-xs text-muted-foreground">Never</span>
  </div>
</div>
