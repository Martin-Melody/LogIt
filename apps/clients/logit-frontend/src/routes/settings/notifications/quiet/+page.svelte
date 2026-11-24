<!-- Settings › Notifications › Quiet mode (design canvas P7): times and days in the phone's own
     time zone. The server holds pushes from people meanwhile and sends one summary at the end. -->
<script lang="ts">
  import { onMount } from "svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { TimeField } from "$lib/components/ui/time-field";
  import { changePushSettings, clock, loadPushSettings, pushSettings } from "$lib/features/settings/pushSettings.svelte";

  const s = $derived(pushSettings.value);
  onMount(() => {
    if (!pushSettings.value) void loadPushSettings();
  });

  const DAYS = [["M", "Monday"], ["T", "Tuesday"], ["W", "Wednesday"], ["T", "Thursday"], ["F", "Friday"], ["S", "Saturday"], ["S", "Sunday"]];

  function setTime(key: "quietFromMinute" | "quietToMinute", value: string) {
    const [h, m] = value.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) void changePushSettings({ [key]: h! * 60 + m! });
  }
</script>

<SettingsPage title="Quiet mode">
  {#if s}
    <SettingsSection>
      <div class={settingRow}>
        <span class="flex-1 text-[15px] font-medium">Quiet mode</span>
        <Switch checked={s.quietOn} label="Quiet mode" onchange={(on) => changePushSettings({ quietOn: on })} />
      </div>
      <div class={settingRow}>
        <span class="flex-1 text-[15px]">From</span>
        <TimeField aria-label="Quiet from" value={clock(s.quietFromMinute)} disabled={!s.quietOn}
          onchange={(v) => setTime("quietFromMinute", v)} />
      </div>
      <div class={settingRow}>
        <span class="flex-1 text-[15px]">To</span>
        <TimeField aria-label="Quiet until" value={clock(s.quietToMinute)} disabled={!s.quietOn}
          onchange={(v) => setTime("quietToMinute", v)} />
      </div>
      <div class="flex flex-col gap-2.5 px-3 pb-4 pt-3">
        <span id="days" class="text-[15px]">Days</span>
        <div class="flex justify-between" role="group" aria-labelledby="days">
          {#each DAYS as [letter, name], i (name)}
            {@const on = (s.quietDays & (1 << i)) !== 0}
            <button type="button" aria-pressed={on} aria-label={name} disabled={!s.quietOn}
              class="size-11 rounded-full text-sm font-semibold transition-colors duration-150 disabled:opacity-50 {on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}"
              onclick={() => changePushSettings({ quietDays: s.quietDays ^ (1 << i) })}>{letter}</button>
          {/each}
        </div>
      </div>
    </SettingsSection>

    <section aria-labelledby="wq-h" class="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5">
      <h2 id="wq-h" class="text-[13px] font-semibold text-muted-foreground">While it's on</h2>
      <p class="text-sm leading-relaxed">No pushes from people. They wait in the Inbox, and you get one summary when it ends.</p>
      <p class="text-sm leading-relaxed">Your workout reminders and rest alerts still come through.</p>
    </section>
  {/if}
</SettingsPage>
