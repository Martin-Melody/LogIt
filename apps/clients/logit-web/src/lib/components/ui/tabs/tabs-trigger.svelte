<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { getContext } from "svelte";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
	const variant = getContext<(() => string) | undefined>("tabs-variant") ?? (() => "segmented");
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"relative inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-medium tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		// segmented: the ::after stretches the tap area over the track's padding (full-height target)
		variant() === "line"
			? "-mb-px h-9 border-b-2 border-transparent flex-none data-[state=active]:border-primary data-[state=active]:font-semibold"
			: "rounded-md after:absolute after:-inset-y-[3px] after:inset-x-0 after:content-[''] data-[state=active]:bg-background data-[state=active]:shadow-sm",
		className
	)}
	{...restProps}
/>
