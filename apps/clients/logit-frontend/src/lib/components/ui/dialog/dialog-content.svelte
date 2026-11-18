<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import type { ComponentProps } from "svelte";
	import { onBack, sheetDrag } from "$lib/components/sheet/sheet";

	// Every dialog closes with Android's back (newest first), and a bottom sheet (`sheet`) also
	// closes by dragging it down (Martin, 2026-11-18). Both go through the Close button, so the
	// dialog closes exactly as if it was tapped.

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		sheet = false,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
		/** A bottom sheet: pinned to the bottom, a grab bar, and drag down to close. */
		sheet?: boolean;
	} = $props();

	let closeEl = $state<HTMLElement | null>(null);
	const close = () => closeEl?.click();

	$effect(() => onBack(close));

	$effect(() => {
		if (!sheet || !ref) return;
		const drag = sheetDrag(ref, { onDismiss: close });
		return () => drag.destroy();
	});
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
			sheet &&
				"grid-cols-[minmax(0,1fr)] top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl border-x-0 border-b-0 max-h-[90dvh] overflow-y-auto overscroll-contain px-4 pt-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10 sm:left-[50%] sm:max-w-[420px] sm:translate-x-[-50%]",
			className
		)}
		{...restProps}
	>
		{#if sheet}
			<div data-sheet-bar aria-hidden="true" class="col-span-full -mb-2 flex h-6 w-full shrink-0 cursor-grab touch-none items-start justify-center pt-2.5">
				<div class="h-1 w-10 rounded-full bg-muted-foreground/30"></div>
			</div>
		{/if}
		{@render children?.()}
		{#if !showCloseButton}
			<DialogPrimitive.Close bind:ref={closeEl} class="sr-only" tabindex={-1}>Close</DialogPrimitive.Close>
		{:else}
			<DialogPrimitive.Close
				bind:ref={closeEl}
				class="ring-offset-background focus:ring-ring absolute end-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
			>
				<XIcon />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
