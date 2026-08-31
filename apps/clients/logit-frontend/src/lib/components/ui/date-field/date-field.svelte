<script lang="ts">
	import { DateField as DateFieldPrimitive } from "bits-ui";
	import { CalendarDate, parseDate, type DateValue } from "@internationalized/date";
	import { cn } from "$lib/utils.js";

	type Props = {
		/** Bound value as an ISO date string (YYYY-MM-DD). */
		value?: string;
		/** Latest selectable date, ISO. */
		maxIso?: string;
		/** Earliest selectable date, ISO. */
		minIso?: string;
		class?: string;
		"aria-label"?: string;
	};

	let {
		value = $bindable<string | undefined>(),
		maxIso,
		minIso,
		class: className,
		"aria-label": ariaLabel,
	}: Props = $props();

	function toDateValue(iso: string | undefined): DateValue | undefined {
		if (!iso) return undefined;
		try {
			return parseDate(iso);
		} catch {
			return undefined;
		}
	}

	const dv = $derived(toDateValue(value));
	const maxDv = $derived(toDateValue(maxIso));
	const minDv = $derived(toDateValue(minIso));
	// Anchor an empty field near a plausible date so the user isn't spinning from 2001.
	const placeholder = $derived<DateValue>(dv ?? maxDv ?? new CalendarDate(1995, 1, 1));
</script>

<DateFieldPrimitive.Root
	value={dv}
	{placeholder}
	maxValue={maxDv}
	minValue={minDv}
	granularity="day"
	onValueChange={(v) => (value = v ? v.toString() : undefined)}
>
	<DateFieldPrimitive.Input
		aria-label={ariaLabel}
		class={cn(
			"border-input bg-transparent focus-within:border-ring focus-within:ring-ring/50 flex h-9 w-full items-center rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]",
			className
		)}
	>
		{#snippet children({ segments })}
			{#each segments as { part, value: segValue }, i (part + i)}
				<DateFieldPrimitive.Segment
					{part}
					class={cn(
						"rounded px-0.5 tabular-nums focus:outline-none",
						part === "literal"
							? "text-muted-foreground px-0"
							: "data-[placeholder]:text-muted-foreground focus:bg-accent focus:text-accent-foreground"
					)}
				>
					{segValue}
				</DateFieldPrimitive.Segment>
			{/each}
		{/snippet}
	</DateFieldPrimitive.Input>
</DateFieldPrimitive.Root>
