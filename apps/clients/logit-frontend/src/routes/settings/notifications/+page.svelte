<!-- Settings › Notifications (design canvas P1, P2, P8): pause and quiet mode, who can reach you
     from people (kept on the server, which gathers and holds pushes), and your own training
     notifications (on this phone). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { BellOff, ChevronRight } from "lucide-svelte";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import SettingsSection, { settingRow } from "$lib/features/settings/SettingsSection.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { reveal } from "$lib/transitions";
  import { isNativePlatform } from "$lib/platform/isNative";
  import { askForPush, openAndroidNotificationSettings, pushPermission, type PushPermission } from "$lib/platform/push";
  import { AUDIENCE_LABEL, changePushSettings, clock, loadPushSettings, pushSettings, quietSummary } from "$lib/features/settings/pushSettings.svelte";
  import { getWorkoutReminders, mondayFirst, setWorkoutReminders, type WorkoutReminders } from "$lib/features/onboarding/workoutReminders";
  import { restAlertsOn, setRestAlerts } from "$lib/services/restTimerService";

  const native = isNativePlatform();
  let permission = $state<PushPermission>("unavailable");
  let pausing = $state(false);
  let reminders = $state<WorkoutReminders | null>(getWorkoutReminders());
  let restAlerts = $state(restAlertsOn());

  const s = $derived(pushSettings.value);
  // Nothing from people can arrive: Android blocks it, or this server can't push.
  const blocked = $derived(permission === "denied" || s?.available === false);

  async function readPermission() {
    permission = await pushPermission();
  }
  onMount(() => {
    void loadPushSettings();
    void readPermission();
    // Back from Android's settings.
    const onVisible = () => document.visibilityState === "visible" && void readPermission();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  async function turnOn() {
    await askForPush();
    await readPermission();
  }

  const PAUSE_HOURS = [0.25, 1, 2, 4, 8];
  function pauseFor(hours: number) {
    pausing = false;
    void changePushSettings({ pausedUntil: new Date(Date.now() + hours * 3_600_000).toISOString() });
  }
  const pauseLabel = (h: number) => (h < 1 ? "15 minutes" : h === 1 ? "1 hour" : `${h} hours`);
  // 24-hour, like the quiet mode times.
  const until = (iso: string) => {
    const d = new Date(iso);
    return clock(d.getHours() * 60 + d.getMinutes());
  };

  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function remindersSummary(r: WorkoutReminders) {
    const days = mondayFirst(r.weekdays).map((d) => DAY[d]);
    return `${days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : (days[0] ?? "")} at ${r.time.replace(/^0(\d)/, "$1")}`;
  }
  async function toggleReminders(on: boolean) {
    if (!reminders) return;
    await setWorkoutReminders({ ...reminders, on });
    reminders = getWorkoutReminders();
  }

  const link = `${settingRow} w-full text-left text-inherit no-underline hover:bg-muted/40`;
  const value = "flex items-center gap-1.5 text-sm text-muted-foreground";
</script>

<SettingsPage title="Notifications">
  {#if native && permission === "denied"}
    <section transition:reveal class="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4" aria-labelledby="off-h">
      <div class="flex items-center gap-2.5">
        <BellOff class="size-5 text-warning" aria-hidden="true" />
        <h2 id="off-h" class="text-[15px] font-semibold">Notifications are off for LogIt</h2>
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground">Android is blocking them, so nothing below reaches this phone. Everything still waits in LogIt's inbox.</p>
      <button type="button" class="h-11 rounded-[10px] bg-foreground text-sm font-semibold text-background" onclick={openAndroidNotificationSettings}>Open Android settings</button>
    </section>
  {:else if native && permission === "prompt" && s?.available}
    <section transition:reveal class="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4" aria-labelledby="ask-h">
      <h2 id="ask-h" class="text-[15px] font-semibold">Get these on your phone</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">See when your coach messages you or someone comments, without opening LogIt.</p>
      <button type="button" class="h-11 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground" onclick={turnOn}>Turn on</button>
    </section>
  {:else if s?.available === false}
    <p transition:reveal class="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
      This server doesn't send pushes, so these wait in the Inbox. Its admin can turn pushes on from the admin console's Server page.
    </p>
  {/if}

  {#if pushSettings.error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your notification settings. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={loadPushSettings}>Try again</button></p>
  {:else if s}
    <div class="flex flex-col gap-6 transition-opacity {blocked ? 'opacity-55' : ''}" inert={blocked}>
      <SettingsSection>
        <div id="pause" class={settingRow}>
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-medium">Pause all</span>
            {#if s.pausedUntil}<span class="text-[13px] text-muted-foreground" transition:reveal>Until {until(s.pausedUntil)}. Your training reminders still come through.</span>{/if}
          </span>
          <Switch checked={!!s.pausedUntil} label="Pause all"
            onchange={(on) => (on ? (pausing = true) : void changePushSettings({ resume: true }))} />
        </div>
        <a href="/settings/notifications/quiet" class={link}>
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-medium">Quiet mode</span>
            <span class="text-[13px] text-muted-foreground">{quietSummary(s)}</span>
          </span>
          <span class="{value} {s.quietOn ? 'text-primary' : ''}">{s.quietOn ? "On" : "Off"}<ChevronRight class="size-4 text-muted-foreground" /></span>
        </a>
      </SettingsSection>

      <SettingsSection title="From people" note="Messages and your coach arrive straight away. Likes, comments and follows are gathered into a few pushes a day.">
        {#each [
          { href: "likes", title: "Likes and comments", v: s.likes === s.comments ? AUDIENCE_LABEL[s.likes] : "Mixed" },
          { href: "follows", title: "Followers and requests", v: s.follows ? "On" : "Off" },
          { href: "messages", title: "Messages", v: s.messages ? "On" : "Off" },
          { href: "coaching", title: "Coaching", v: s.coaching ? "On" : "Off" },
        ] as row (row.href)}
          <a href="/settings/notifications/{row.href}" class={link}>
            <span class="flex-1 text-[15px] font-medium">{row.title}</span>
            <span class={value}>{row.v}<ChevronRight class="size-4" /></span>
          </a>
        {/each}
      </SettingsSection>
    </div>
  {/if}

  {#if native}
    <SettingsSection id="training" title="Your training" note="Your own reminders always come through, even in quiet mode or while paused.">
      <div class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Workout reminders</span>
          <span class="text-[13px] text-muted-foreground">{reminders ? remindersSummary(reminders) : "You can set these after your first workout"}</span>
        </span>
        {#if reminders && !reminders.permissionDenied}
          <Switch checked={reminders.on} label="Workout reminders" onchange={toggleReminders} />
        {/if}
      </div>
      <div class={settingRow}>
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-medium">Rest alerts</span>
          <span class="text-[13px] text-muted-foreground">When a rest ends with LogIt in the background</span>
        </span>
        <Switch checked={restAlerts} label="Rest alerts" onchange={(on) => { setRestAlerts(on); restAlerts = on; }} />
      </div>
    </SettingsSection>
  {/if}
</SettingsPage>

{#if pausing}
  <BottomSheet label="Pause all notifications" onclose={() => (pausing = false)}>
    <div class="flex flex-col px-4 pb-2">
      <h2 class="text-[17px] font-semibold">Pause all notifications</h2>
      <p class="mb-2 mt-1 text-sm leading-relaxed text-muted-foreground">Pushes from people stop until then. Your training reminders and rest alerts still come through.</p>
      {#each PAUSE_HOURS as h (h)}
        <button type="button" class="min-h-13 border-b border-border text-left text-[15px] last:border-b-0 hover:bg-muted/40" onclick={() => pauseFor(h)}>
          {pauseLabel(h)}
        </button>
      {/each}
    </div>
  </BottomSheet>
{/if}
