<script lang="ts">
  import LockIcon from "@lucide/svelte/icons/lock";

  let { name, what, note = "" }: { name: string; what: string; note?: string } = $props();
</script>

<section class="flex items-start gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
  <LockIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  <div class="flex flex-col gap-1">
    <h2 class="text-sm font-semibold">Not shared with you</h2>
    <p class="text-[13px] leading-relaxed text-muted-foreground">{name} keeps {what} private. They can switch it on in My coach.{note ? ` ${note}` : ""}</p>
  </div>
</section>
