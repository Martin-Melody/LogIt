import { Select as SelectPrimitive } from "bits-ui";
import Trigger from "./select-trigger.svelte";
import Content from "./select-content.svelte";
import Item from "./select-item.svelte";

const Root = SelectPrimitive.Root;
const Group = SelectPrimitive.Group;

export {
	Root,
	Group,
	Trigger,
	Content,
	Item,
	//
	Root as Select,
	Group as SelectGroup,
	Trigger as SelectTrigger,
	Content as SelectContent,
	Item as SelectItem,
};
