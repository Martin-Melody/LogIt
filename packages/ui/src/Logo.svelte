<!--
  The LogIt staircase mark. Draws in the current text colour.
  Pass `label` when the mark stands alone (it then gets role="img"); leave it out next to
  the word "LogIt", where it is decoration.
-->
<script lang="ts">
  type Props = { size?: number; strokeWidth?: number; label?: string; class?: string };
  let { size = 28, strokeWidth = 1.7, label, class: className = "" }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 32 32"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linejoin="round"
  class={className}
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  <path d="M4.5 25.5V20.9H12.3V14.9H20.4V8.9H28" />
  <path d="M4 18.2H10.7M11.9 12.2H18.6M19.9 6.2H28" />
</svg>
