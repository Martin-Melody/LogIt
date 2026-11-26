<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	// The circle. Put it in a <label> row, or give it an aria-label.
	let { ref = $bindable(null), class: className, ...restProps }: WithoutChildrenOrChild<RadioGroupPrimitive.ItemProps> = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		"group grid size-[22px] shrink-0 place-content-center rounded-full border-2 border-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span class={cn("size-2.5 rounded-full bg-primary transition-transform duration-150 ease-out motion-reduce:transition-none", checked ? "scale-100" : "scale-0")}></span>
	{/snippet}
</RadioGroupPrimitive.Item>
