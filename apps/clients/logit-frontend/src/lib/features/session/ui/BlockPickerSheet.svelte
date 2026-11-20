<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Dumbbell, Timer, PersonStanding, Puzzle } from "lucide-svelte";
  import { listBlockDefs } from "$lib/features/session/blocks";
  import { listBlockDeclarations } from "$lib/plugins/blockPluginStore";
  import { pluginBlockType } from "@logit/core/domain/blockPlugin";

  const ICONS: Record<string, typeof Dumbbell> = {
    strength: Dumbbell,
    cardio: Timer,
    mobility: PersonStanding,
  };

  const props = $props<{
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    onSelect?: (type: string) => void;
    /** Only these block types (the split day editor plans three). */
    types?: string[];
  }>();

  const onOpenChange = props.onOpenChange ?? ((_v: boolean) => {});
  const onSelect = props.onSelect ?? ((_t: string) => {});

  // The built-in kinds, then a row per installed workout-block plugin (not in the split editor).
  const defs = $derived([
    ...listBlockDefs().filter((d) => !d.type.startsWith("plugin:") && (!props.types || props.types.includes(d.type))),
    ...(props.types ? [] : listBlockDeclarations().map((d) => ({ type: pluginBlockType(d.id), label: d.name, description: d.description }))),
  ]);
</script>

<Dialog.Root open={props.open ?? false} {onOpenChange}>
  <Dialog.Content class="sm:max-w-[360px]">
    <Dialog.Header>
      <Dialog.Title>Add block</Dialog.Title>
      <Dialog.Description>Choose what to track.</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-2 py-1">
      {#each defs as def (def.type)}
        {@const Icon = ICONS[def.type] ?? Puzzle}
        <button
          type="button"
          class="flex items-center gap-3 rounded-md border border-border px-3 py-3 text-left hover:bg-muted/50"
          onclick={() => { onSelect(def.type); onOpenChange(false); }}
        >
          {#if Icon}
            <Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
          {/if}
          <div>
            <p class="text-sm font-medium">{def.label}</p>
            {#if def.description}
              <p class="text-xs text-muted-foreground">{def.description}</p>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
