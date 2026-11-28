<!-- Settings › Workout: how a workout behaves (blocks, effort, rest timers, circuits). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { BRING } from "@logit/core/domain/kit";
  import { kit, setKit } from "$lib/features/kit/kit";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { reveal } from "$lib/transitions";
  import { profile } from "$lib/stores/profile.store";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { SET_TYPE_META } from "@logit/core/domain/workout";
  import { BETWEEN_EXERCISES_KEY, GET_READY_KEY, circuitDefaultsFrom } from "$lib/features/session/circuit/circuitSettings";

  // Rest defaults are configurable per set type; the list is the single source
  // of truth in @logit/core so plugin-registered types show up here too.
  const restDefaultTypes = SET_TYPE_META.map((m) => ({ type: m.type, label: m.label }));

  function toggleRestDefault(type: string) {
    const current = $profile.restDefaults[type];
    profile.save({ restDefaults: { ...$profile.restDefaults, [type]: current !== undefined ? undefined : 90_000 } });
  }
  function setRestSeconds(type: string, seconds: string) {
    const ms = Math.round(Number(seconds) * 1000);
    if (!Number.isFinite(ms) || ms <= 0) return;
    profile.save({ restDefaults: { ...$profile.restDefaults, [type]: ms } });
  }

  // Circuit defaults: stored in restDefaults under their own keys (circuitSettings.ts).
  const circuitDefaults = $derived(circuitDefaultsFrom($profile.restDefaults));
  function setCircuitDefault(key: string, ms: number) {
    profile.save({ restDefaults: { ...$profile.restDefaults, [key]: ms } });
  }
  function setCircuitSeconds(key: string, seconds: string, min: number, max: number) {
    const sec = Math.round(Number(seconds));
    if (!Number.isFinite(sec) || sec < min || sec > max) return;
    setCircuitDefault(key, sec * 1000);
  }

  // Android only: without "Alarms & reminders" the rest alert is an inexact alarm, which can come late.
  let exactAlarms = $state<boolean | null>(null);
  async function readExactAlarms(change = false) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const r = await (change ? LocalNotifications.changeExactNotificationSetting() : LocalNotifications.checkExactNotificationSetting());
      exactAlarms = r.exact_alarm === "granted";
    } catch {}
  }
  onMount(() => {
    if (isNativePlatform()) void readExactAlarms();
  });

  const numberInput = "h-10 w-16 rounded-md border bg-background px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

<SettingsPage title="Workout">
  <SettingsSection title="During a workout">
    <label id="collapse-blocks" class="{settingRow} cursor-pointer">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-medium">Collapse blocks by default</span>
        <span class="text-[13px] text-muted-foreground">Exercise blocks start collapsed.</span>
      </span>
      <Switch checked={$profile.blocksCollapsedByDefault} label="Collapse blocks by default"
        onchange={() => profile.save({ blocksCollapsedByDefault: !$profile.blocksCollapsedByDefault })} />
    </label>
    <label id="ask-effort" class="{settingRow} cursor-pointer">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-medium">Ask how hard each set was</span>
        <span class="text-[13px] text-muted-foreground">After you tick a set, one tap says how many more reps you had in you. Saved as RPE.</span>
      </span>
      <Switch checked={$profile.askEffortAfterSet} label="Ask how hard each set was"
        onchange={() => profile.save({ askEffortAfterSet: !$profile.askEffortAfterSet })} />
    </label>
  </SettingsSection>

  <!-- Canvas EQ4: the kit that goes in your bag. -->
  <SettingsSection id="what-you-bring" title="What you bring" note="Your coach sees this list. The stack pin and dip belt change your plans.">
    {#each BRING as b (b.id)}
      <label class="{settingRow} cursor-pointer">
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">{b.label}</span>
          <span class="text-[13px] text-muted-foreground">{b.text}</span>
        </span>
        <Switch checked={$kit.includes(b.id)} label={b.label} onchange={() => setKit($kit.includes(b.id) ? $kit.filter((x) => x !== b.id) : [...$kit, b.id])} />
      </label>
    {/each}
  </SettingsSection>

  <SettingsSection id="rest-timer" title="Rest timer" note="Turn the timer on for a kind of set and choose how long it rests.">
    {#each restDefaultTypes as { type, label } (type)}
      {@const enabled = $profile.restDefaults[type] !== undefined}
      {@const seconds = enabled ? Math.round(($profile.restDefaults[type] ?? 90_000) / 1000) : 90}
      <div class="{settingRow} min-h-13">
        <Switch checked={enabled} label={`Auto rest timer: ${label}`} onchange={() => toggleRestDefault(type)} class="-ml-1.5 mr-0" />
        <span class="flex-1 text-[15px]">{label}</span>
        {#if enabled}
          <div class="flex items-center gap-1.5" transition:reveal={{ axis: "x" }}>
            <input type="number" min="5" max="600" class={numberInput} value={seconds} aria-label="{label} rest, seconds"
              onchange={(e) => setRestSeconds(type, (e.target as HTMLInputElement).value)} />
            <span class="text-xs text-muted-foreground">sec</span>
          </div>
        {/if}
      </div>
    {/each}
  </SettingsSection>

  {#if exactAlarms !== null}
    <SettingsSection>
      <label id="exact-alarms" class="{settingRow} cursor-pointer">
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Rest alerts on time</span>
          <span class="text-[13px] text-muted-foreground">
            With the app in the background, Android can send "Rest complete" late unless LogIt may set alarms. Opens Android's Alarms &amp; reminders.
          </span>
        </span>
        <Switch checked={exactAlarms} label="Rest alerts on time" onchange={() => readExactAlarms(true)} />
      </label>
    </SettingsSection>
  {/if}

  <SettingsSection id="circuits" title="Circuits" note="Defaults for every circuit. To change one circuit, tap its name in a workout.">
    <div class={settingRow}>
      <span class="flex-1 text-[15px]">Get ready before each exercise</span>
      <input type="number" min="1" max="30" aria-label="Get ready before each exercise, seconds" class={numberInput}
        value={Math.round(circuitDefaults.leadInMs / 1000)}
        onchange={(e) => setCircuitSeconds(GET_READY_KEY, (e.target as HTMLInputElement).value, 1, 30)} />
      <span class="text-xs text-muted-foreground">sec</span>
    </div>
    <div class={settingRow}>
      <Switch checked={circuitDefaults.memberRestMs > 0} label="Rest between exercises in a circuit" class="-ml-1.5 mr-0"
        onchange={() => setCircuitDefault(BETWEEN_EXERCISES_KEY, circuitDefaults.memberRestMs > 0 ? 0 : 15_000)} />
      <span class="flex-1 text-[15px]">Rest between exercises</span>
      {#if circuitDefaults.memberRestMs > 0}
        <div class="flex items-center gap-1.5" transition:reveal={{ axis: "x" }}>
          <input type="number" min="5" max="600" aria-label="Rest between exercises, seconds" class={numberInput}
            value={Math.round(circuitDefaults.memberRestMs / 1000)}
            onchange={(e) => setCircuitSeconds(BETWEEN_EXERCISES_KEY, (e.target as HTMLInputElement).value, 5, 600)} />
          <span class="text-xs text-muted-foreground">sec</span>
        </div>
      {/if}
    </div>
  </SettingsSection>
</SettingsPage>
