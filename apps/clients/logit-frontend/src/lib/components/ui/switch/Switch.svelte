<script lang="ts">
  import { cn } from "$lib/utils.js";

  /**
   * The one on/off switch. The track is the usual 24 × 44px, but the button
   * around it is 44px tall, so it's a full-size tap target in a settings row.
   */
  const {
    checked = false,
    label,
    disabled = false,
    onchange = (_v: boolean) => {},
    class: className = "",
  }: {
    checked?: boolean;
    /** Accessible name (the visible row text, usually). */
    label: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
    class?: string;
  } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  class={cn("group -mr-1.5 flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50", className)}
  onclick={() => onchange(!checked)}
>
  <span
    class="relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring {checked ? 'bg-primary' : 'bg-input'}"
  >
    <span
      class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md transition-transform {checked ? 'translate-x-5' : 'translate-x-0'}"
    ></span>
  </span>
</button>
