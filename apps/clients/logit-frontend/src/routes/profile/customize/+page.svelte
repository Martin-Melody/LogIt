<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { ArrowUp, ArrowDown } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { profileConfig } from "$lib/stores/profileConfig.store";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";

  const widgets = localProfileWidgetRegistry.list();

  const orderedSlots = $derived(
    [...$profileConfig.slots].sort((a, b) => a.orderIndex - b.orderIndex),
  );
</script>

<div class="flex flex-col gap-3 p-3 pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/profile")} />
    <h1 class="page-title">Customise profile</h1>
  </PageHeader>

  <Card.Root>
    <Card.Content class="pt-3">
      <ul class="flex flex-col divide-y divide-border">
        {#each orderedSlots as slot, i (slot.id)}
          {@const def = widgets.find((w) => w.id === slot.id)}
          {#if def}
            <li class="py-2 flex items-center gap-2">
              <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                <span class="text-sm font-medium">{def.label}</span>
                <span class="text-xs text-muted-foreground">{def.description}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" disabled={i === 0} aria-label="Move up" onclick={() => profileConfig.moveUp(slot.id)}>
                  <ArrowUp class="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" disabled={i === orderedSlots.length - 1} aria-label="Move down" onclick={() => profileConfig.moveDown(slot.id)}>
                  <ArrowDown class="h-3.5 w-3.5" />
                </Button>
                <Switch checked={slot.enabled} label={slot.enabled ? "Disable widget" : "Enable widget"} onchange={() => profileConfig.toggleWidget(slot.id)} />
              </div>
            </li>
          {/if}
        {/each}
      </ul>
    </Card.Content>
  </Card.Root>

  <p class="text-xs text-muted-foreground px-1">
    Reorder and toggle widgets to personalise your profile. Community plugin widgets coming soon.
  </p>
</div>
