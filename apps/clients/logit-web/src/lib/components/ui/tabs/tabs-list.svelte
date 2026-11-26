<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";

	// Two looks (DESIGN.md): segmented (a grey track, the chosen tab raised, like choice.ts) and
	// line (an underline, for switching what a whole page shows).
	export const tabsListVariants = tv({
		base: "group/tabs-list flex w-full items-stretch text-muted-foreground",
		variants: {
			variant: {
				segmented: "h-9 gap-0.5 rounded-lg bg-muted p-[3px]",
				line: "border-b border-border",
			},
		},
		defaultVariants: { variant: "segmented" },
	});

	export type TabsListVariant = VariantProps<typeof tabsListVariants>["variant"];
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { setContext } from "svelte";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		variant = "segmented",
		class: className,
		...restProps
	}: TabsPrimitive.ListProps & { variant?: TabsListVariant } = $props();
	// Triggers read the look from here, so a caller's class on a trigger overrides it cleanly.
	setContext("tabs-variant", () => variant);
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	data-variant={variant}
	class={cn(tabsListVariants({ variant }), className)}
	{...restProps}
/>
