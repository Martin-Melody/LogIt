<script lang="ts">
	import { TimeField as TimeFieldPrimitive } from "bits-ui";
	import { Time } from "@internationalized/date";
	import { cn } from "$lib/utils.js";

	// Our time picker (instead of <input type="time">): hour and minute segments, 24-hour, typed
	// or nudged with the arrow keys. Same look as DateField.
	type Props = {
		/** "HH:MM". */
		value?: string;
		onchange?: (value: string) => void;
		disabled?: boolean;
		class?: string;
		"aria-label"?: string;
	};

	let { value = $bindable<string | undefined>(), onchange, disabled = false, class: className, "aria-label": ariaLabel }: Props = $props();

	const toTime = (s: string | undefined) => {
		const [h, m] = (s ?? "").split(":").map(Number);
		return Number.isFinite(h) && Number.isFinite(m) ? new Time(h, m) : undefined;
	};
	const pad = (n: number) => String(n).padStart(2, "0");
</script>

<TimeFieldPrimitive.Root
	value={toTime(value)}
	placeholder={new Time(7, 0)}
	hourCycle={24}
	granularity="minute"
	{disabled}
	onValueChange={(v) => {
		if (!v) return;
		value = `${pad(v.hour)}:${pad(v.minute)}`;
		onchange?.(value);
	}}
>
	<TimeFieldPrimitive.Input
		aria-label={ariaLabel}
		class={cn(
			"border-input bg-transparent focus-within:border-ring focus-within:ring-ring/50 inline-flex h-10 items-center rounded-md border px-2.5 text-[15px] font-semibold tabular-nums transition-[color,box-shadow] focus-within:ring-[3px] data-[disabled]:opacity-50",
			className
		)}
	>
		{#snippet children({ segments })}
			{#each segments as { part, value: segValue }, i (part + i)}
				<TimeFieldPrimitive.Segment
					{part}
					class={cn(
						"rounded-md px-0.5 py-1 focus:outline-none",
						part === "literal"
							? "text-muted-foreground px-0"
							: "data-[placeholder]:text-muted-foreground focus:bg-accent focus:text-accent-foreground"
					)}
				>
					{segValue}
				</TimeFieldPrimitive.Segment>
			{/each}
		{/snippet}
	</TimeFieldPrimitive.Input>
</TimeFieldPrimitive.Root>
