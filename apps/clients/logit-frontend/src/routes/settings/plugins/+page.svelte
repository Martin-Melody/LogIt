<!-- Settings › Plugins: whether community plugins run, and the catalog. -->
<script lang="ts">
  import { ChevronRight } from "lucide-svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import { pluginSettings } from "$lib/plugins";
</script>

<SettingsPage title="Plugins">
  <SettingsSection note="Community plugins are widgets and algorithms other people made. Turn them on from the catalog.">
    <div class={settingRow}>
      <span class="flex-1 text-[15px] font-medium">Community plugins</span>
      {#if $pluginSettings.communityPluginsEnabled}
        <span class="rounded-full bg-success/12 px-2 py-0.5 text-xs font-semibold text-success">On</span>
      {:else}
        <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Off</span>
      {/if}
    </div>
    <a href="/plugins" class="{settingRow} text-inherit no-underline hover:bg-muted/40">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-medium">Plugin catalog</span>
        <span class="text-[13px] text-muted-foreground">Widgets, algorithms and workout blocks</span>
      </span>
      <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </a>
  </SettingsSection>
</SettingsPage>
