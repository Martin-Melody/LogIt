<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	// Our "pick one of these" list (instead of <input type="radio">), shadcn's radio-group.
	let { ref = $bindable(null), value = $bindable(), class: className, ...restProps }: RadioGroupPrimitive.RootProps = $props();
</script>

<RadioGroupPrimitive.Root bind:ref bind:value data-slot="radio-group" class={cn("grid gap-0", className)} {...restProps} />
