<!-- Settings › Privacy › Story and training now (design canvas S4): Close friends and Hide story
     from (Instagram's story controls), who can cheer and reply, and training now (Instagram's
     activity status). -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onMount } from "svelte";
  import { ChevronRight } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { socialApi, type SocialSettings } from "@logit/core/api/socialApi";
  import { storiesApi } from "@logit/core/api/storiesApi";

  let settings = $state<SocialSettings | null>(null);
  let error = $state(false);
  let lists = $state<{ closeFriends: number; hidden: number } | null>(null);

  async function load() {
    try {
      settings = await socialApi.getSettings();
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(() => {
    void load();
    storiesApi.lists().then((l) => (lists = { closeFriends: l.closeFriends.length, hidden: l.hidden.length })).catch(() => {});
  });
  const count = (n: number | undefined, none: string) => (n === undefined ? "" : n === 0 ? none : `${n} ${n === 1 ? "person" : "people"}`);

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
    { value: "Everyone", label: "Everyone who can see you" },
    { value: "Following", label: "People you follow" },
    { value: "Off", label: "Off" },
  ];
  const link = `${settingRow} w-full text-left text-inherit no-underline hover:bg-muted/40`;
  const option = "flex min-h-13 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 text-[15px] last:border-b-0";
</script>

<SettingsPage title="Story and training now">
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your settings. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if !settings}
    <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
  {:else}
    <SettingsSection title="Story" note="Stories follow your account: your followers see them, and on a private account only the followers you accepted.">
      <a href="/settings/privacy/story/close-friends" class={link}>
        <span class="flex-1 text-[15px] font-medium">Close friends</span>
        <span class="flex items-center gap-1.5 text-sm text-muted-foreground">{count(lists?.closeFriends, "Nobody yet")}<ChevronRight class="size-4" /></span>
      </a>
      <a href="/settings/privacy/story/hidden" class={link}>
        <span class="flex-1 text-[15px] font-medium">Hide story from</span>
        <span class="flex items-center gap-1.5 text-sm text-muted-foreground">{count(lists?.hidden, "Nobody")}<ChevronRight class="size-4" /></span>
      </a>
    </SettingsSection>

    <SettingsSection title="Training now" note="Turn it off and you won't see when others are training either, as on Instagram.">
      <div id="show-training" class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Show when you're training</span>
          <span class="text-[13px] leading-snug text-muted-foreground">People you follow see a green dot while your workout runs, and can cheer you on</span>
        </span>
        <Switch checked={settings.showTraining} label="Show when you're training" onchange={(v) => set({ showTraining: v })} />
      </div>
    </SettingsSection>

    <SettingsSection title="Cheers and replies" note="Who can cheer you on while you train, and cheer or reply to your stories. A cheer mid-workout is a small pill and a light buzz, never over a set or a rest.">
      <RadioGroup.Root value={settings.cheersFrom} aria-label="Who can cheer you on and reply to your stories" onValueChange={(v) => set({ cheersFrom: v as SocialSettings["cheersFrom"] })}>
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
