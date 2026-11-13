<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  let { items, class: className = "" }: { items: string[]; class?: string } = $props();
</script>

<ul class="flex flex-col gap-2.5 text-[15px] text-foreground/85 {className}">
  {#each items as item (item)}
    <li class="flex items-start gap-2.5">
      <Check class="mt-0.5 size-[18px] shrink-0 text-success" strokeWidth={2.4} aria-hidden="true" />
      <span>{item}</span>
    </li>
  {/each}
</ul>
