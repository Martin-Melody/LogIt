<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: DropdownMenuPrimitive.ItemProps & { variant?: "default" | "destructive" } = $props();
</script>

<!-- 44px rows: these menus are opened mid-workout, one-handed. -->
<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-variant={variant}
	class={cn(
		"data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:[&_svg]:text-destructive relative flex h-11 w-full cursor-default items-center gap-3 rounded-sm px-3 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</DropdownMenuPrimitive.Item>
