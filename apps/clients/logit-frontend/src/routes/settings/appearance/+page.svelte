<!-- Settings › Appearance: theme and the bottom bar. -->
<script lang="ts">
  import { ChevronRight } from "lucide-svelte";
  import { setMode, userPrefersMode } from "mode-watcher";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
</script>

<SettingsPage title="Appearance">
  <SettingsSection id="theme" title="Theme">
    <div class={settingRow}>
      <div class={segmentTrack}>
        {#each [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as ["system" | "light" | "dark", string][] as [value, label] (value)}
          <button type="button" class={segment(userPrefersMode.current === value)} aria-pressed={userPrefersMode.current === value}
            onclick={() => setMode(value)}>{label}</button>
        {/each}
      </div>
    </div>
  </SettingsSection>

  <SettingsSection>
    <a href="/settings/navbar" class="{settingRow} text-inherit no-underline hover:bg-muted/40">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-medium">Customise navigation</span>
        <span class="text-[13px] text-muted-foreground">The tabs in the bottom bar</span>
      </span>
      <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </a>
  </SettingsSection>
</SettingsPage>
