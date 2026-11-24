<!-- Settings › Privacy › Messages (design canvas P2): Instagram's message controls. People you
     follow always reach your chats; your coach always can, in the coach thread. -->
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

  const option = "flex min-h-13 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 text-[15px] last:border-b-0";
</script>

<SettingsPage title="Messages">
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your settings. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !settings}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    <SettingsSection title="People who follow you" note="People you follow always reach your chats.">
      <RadioGroup.Root value={settings.dmFromFollowers} aria-label="Messages from people who follow you" onValueChange={(v) => set({ dmFromFollowers: v as SocialSettings["dmFromFollowers"] })}>
        <label class={option}>Straight to your chats<RadioGroup.Item value="Chats" /></label>
        <label class={option}>Message requests<RadioGroup.Item value="Requests" /></label>
      </RadioGroup.Root>
    </SettingsSection>

    <SettingsSection title="Everyone else" note="Group members you don't follow count as everyone else. Your coach can always message you, in your coach thread.">
      <RadioGroup.Root value={settings.dmFromOthers} aria-label="Messages from everyone else" onValueChange={(v) => set({ dmFromOthers: v as SocialSettings["dmFromOthers"] })}>
        <label class={option}>Message requests<RadioGroup.Item value="Requests" /></label>
        <label class={option}>Don't receive<RadioGroup.Item value="Off" /></label>
      </RadioGroup.Root>
    </SettingsSection>

    <SettingsSection title="Read receipts">
      <div id="read-receipts" class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Show when you've read a message</span>
          <span class="text-[13px] leading-snug text-muted-foreground">Off, and you won't see when others have read yours either</span>
        </span>
        <Switch checked={settings.showReadReceipts} label="Show when you've read a message" onchange={(v) => set({ showReadReceipts: v })} />
      </div>
    </SettingsSection>
  {/if}
</SettingsPage>
