<!-- Settings › Privacy › Training now and cheers (design canvas S4, its training-now half; the
     story rows come with stories). Training now is Instagram's activity status. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { socialApi, type SocialSettings } from "@logit/core/api/socialApi";

  let settings = $state<SocialSettings | null>(null);
  let error = $state(false);

  async function load() {
    try {
      settings = await socialApi.getSettings();
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function set(change: Partial<SocialSettings>) {
    if (!settings) return;
    const before = settings;
    settings = { ...settings, ...change };
    try {
      settings = await socialApi.updateSettings(change);
    } catch {
      settings = before;
      toast.error("Couldn't save that. Try again.");
    }
  }

  const CHEERS: { value: SocialSettings["cheersFrom"]; label: string }[] = [
    { value: "Everyone", label: "Everyone who can see you training" },
    { value: "Following", label: "People you follow" },
    { value: "Off", label: "Off" },
  ];
  const option = "flex min-h-13 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 text-[15px] last:border-b-0";
</script>

<SettingsPage title="Training now and cheers">
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your settings. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !settings}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <SettingsSection title="Training now" note="Turn it off and you won't see when others are training either, as on Instagram.">
      <div id="show-training" class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Show when you're training</span>
          <span class="text-[13px] leading-snug text-muted-foreground">People you follow see a green dot while your workout runs, and can cheer you on</span>
        </span>
        <Switch checked={settings.showTraining} label="Show when you're training" onchange={(v) => set({ showTraining: v })} />
      </div>
    </SettingsSection>

    <SettingsSection title="Cheers" note="A cheer arrives as a small pill and a light buzz mid-workout, never over a set or a rest.">
      <RadioGroup.Root value={settings.cheersFrom} aria-label="Who can cheer you on" onValueChange={(v) => set({ cheersFrom: v as SocialSettings["cheersFrom"] })}>
        {#each CHEERS as c (c.value)}
          <label class={option}>
            {c.label}
            <RadioGroup.Item value={c.value} />
          </label>
        {/each}
      </RadioGroup.Root>
    </SettingsSection>
  {/if}
</SettingsPage>
