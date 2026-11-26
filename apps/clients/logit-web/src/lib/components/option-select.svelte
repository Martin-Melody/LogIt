<!-- Pick one from a list: the shadcn Select with the boilerplate folded away, so a page passes
     options and binds a value, as it did with a native <select>. Our own component, never the
     browser's (PRODUCT.md principle 7). An option whose value is "" (Never, Not set, Free) works
     like any other. -->
<script lang="ts" module>
  export type SelectOption = { value: string; label: string; group?: string; disabled?: boolean };
</script>

<script lang="ts">
  import * as Select from "$lib/components/ui/select";

  let {
    options,
    value = $bindable(""),
    onValueChange,
    id,
    size = "default",
    class: className,
    placeholder = "Choose…",
    disabled = false,
    "aria-label": ariaLabel,
  }: {
    options: SelectOption[];
    value?: string;
    /** Called with the newly picked value (after `value` has changed). */
    onValueChange?: (value: string) => void;
    id?: string;
    size?: "sm" | "default";
    class?: string;
    placeholder?: string;
    disabled?: boolean;
    "aria-label"?: string;
  } = $props();

  // bits-ui reads "" as "nothing picked", so a real "" option travels under a stand-in.
  const NONE = "__none__";
  const inner = (v: string) => (v === "" ? NONE : v);
  const outer = (v: string) => (v === NONE ? "" : v);

  const picked = $derived(options.find((o) => o.value === value));
  const groups = $derived([...new Set(options.map((o) => o.group ?? ""))]);
</script>

<Select.Root
  type="single"
  {disabled}
  value={picked ? inner(value) : ""}
  onValueChange={(v) => {
    value = outer(v);
    onValueChange?.(value);
  }}
>
  <Select.Trigger {id} {size} class={className} aria-label={ariaLabel}>
    <span data-slot="select-value" class={picked ? "" : "text-muted-foreground"}>{picked?.label ?? placeholder}</span>
  </Select.Trigger>
  <Select.Content>
    {#each groups as g (g)}
      {#if g}
        <Select.Group>
          <Select.GroupHeading>{g}</Select.GroupHeading>
          {#each options.filter((o) => (o.group ?? "") === g) as o (o.value)}
            <Select.Item value={inner(o.value)} label={o.label} disabled={o.disabled} />
          {/each}
        </Select.Group>
      {:else}
        {#each options.filter((o) => !o.group) as o (o.value)}
          <Select.Item value={inner(o.value)} label={o.label} disabled={o.disabled} />
        {/each}
      {/if}
    {/each}
  </Select.Content>
</Select.Root>
