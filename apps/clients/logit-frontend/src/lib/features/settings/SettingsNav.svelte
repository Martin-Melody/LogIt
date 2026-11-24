<!-- Settings › the list of pages (the phone's Settings screen, and the sidebar on a wide screen):
     search, the account card, then a row per page showing what it's set to. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    Bell, Blocks, ChartColumn, ChevronRight, Compass, Database, Info, MapPin, Music, PersonStanding, Ruler,
    Search, SunMoon, Timer, TrendingUp, User, Volume2, X,
  } from "lucide-svelte";
  import { userPrefersMode } from "mode-watcher";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient } from "@logit/core/api/client";
  import { connectionStatus } from "@logit/core/api/connectionStatus.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { equipment } from "$lib/stores/equipment.store";
  import { lastSyncedAt } from "$lib/sync/syncService";
  import { getActiveOwnerId } from "$lib/data/activeOwner";
  import { pluginSettings } from "$lib/plugins";
  import { placesStore } from "$lib/features/places/places.svelte";
  import { musicSettings } from "$lib/features/music/musicSettings";
  import { getSoundSettings } from "$lib/features/sound/sounds";
  import { toDisplayWeight } from "@logit/core/domain/units";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { getProgressionConfig } from "@logit/core/usecases/progression/getProgressionConfig";
  import { listExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { getMobilityProgressionConfig } from "@logit/core/usecases/progression/getMobilityProgressionConfig";
  import { getMuscleGroupInsightConfig } from "@logit/core/usecases/progression/getMuscleGroupInsightConfig";
  import { getAnalyticsConfig, DEFAULT_ANALYTICS_ID } from "@logit/core/usecases/progression/getAnalyticsConfig";
  import ConnectionDot from "$lib/components/ConnectionDot.svelte";
  import { popIn } from "$lib/transitions";
  import { SETTINGS_GROUPS, searchSettings, type SettingsPageId } from "./settingsIndex";

  /** The wide-screen sidebar: smaller rows, no values, the open page marked. */
  const { compact = false }: { compact?: boolean } = $props();

  // lucide-svelte's icons are old-style component classes, hence `typeof Info`.
  const ICONS: Record<Exclude<SettingsPageId, "account">, typeof Info> = {
    workout: Timer, progression: TrendingUp, mobility: PersonStanding, units: Ruler, places: MapPin,
    music: Music, sounds: Volume2, notifications: Bell, appearance: SunMoon, insights: ChartColumn, plugins: Blocks, data: Database,
    walkthroughs: Compass, about: Info,
  };

  let query = $state("");
  const results = $derived(searchSettings(query));
  const resultGroups = $derived(
    [...new Set(results.map((r) => r.page))].map((p) => ({ page: p, list: results.filter((r) => r.page === p) })),
  );

  // Values that need the database.
  let progressionValue = $state("");
  let mobilityValue = $state("");
  let insightsValue = $state("");
  onMount(async () => {
    if (authStore.isAuthenticated) connectionStatus.startPolling();
    const deps = getProgressionDeps();
    try {
      const [prog, overrides, mob, mg, an] = await Promise.all([
        getProgressionConfig(deps),
        listExerciseProgressionSettings(deps),
        getMobilityProgressionConfig(deps),
        getMuscleGroupInsightConfig(deps),
        getAnalyticsConfig(deps),
      ]);
      const active = prog.algorithms.find((a) => a.id === prog.config?.algorithmId)?.name ?? "Suggestions off";
      progressionValue = overrides.length
        ? `${active} · ${overrides.length} exercise${overrides.length === 1 ? "" : "s"} set differently`
        : active;
      mobilityValue = mob.algorithms.find((a) => a.id === mob.activeAlgorithmId)?.name ?? "";
      insightsValue = [
        mg.algorithms.find((a) => a.id === mg.activeAlgorithmId)?.name,
        an.plugins.find((p) => p.id === (an.config?.analyticsId ?? DEFAULT_ANALYTICS_ID))?.name,
      ].filter(Boolean).join(" · ");
    } catch {
      // The rows still work without their values.
    }
  });

  const trim = (n: number) => Number(n.toFixed(2)).toString();
  const unit = $derived($profile.weightUnit === "lbs" ? "lb" : "kg");
  const normalRest = $derived($profile.restDefaults.normal);
  const sounds = getSoundSettings();
  const playlists = $derived($musicSettings.playlists.length);
  const placeNames = $derived(placesStore.active.map((p) => p.name));

  const values = $derived<Partial<Record<SettingsPageId, string>>>({
    workout: [
      normalRest ? `Rest timer ${Math.floor(normalRest / 60_000)}:${String(Math.round((normalRest % 60_000) / 1000)).padStart(2, "0")}` : "Rest timer off",
      $profile.askEffortAfterSet ? "Ask how hard" : "",
    ].filter(Boolean).join(" · "),
    progression: progressionValue,
    mobility: [mobilityValue, $profile.mobilityLeadSide === "right" ? "Right side first" : "Left side first"].filter(Boolean).join(" · "),
    units: `${unit} · ${$profile.heightUnit} · ${trim(toDisplayWeight($equipment.barbell.barKg, $profile.weightUnit))} ${unit} bar`,
    places: placeNames.length ? placeNames.join(", ") : "Where you train",
    music: playlists ? `${playlists} workout playlist${playlists === 1 ? "" : "s"}` : "Spotify, YouTube Music",
    sounds: [sounds.timers && "Timers", sounds.celebrations && "Celebrations", sounds.taps && "Taps"].filter(Boolean).join(", ") || "Off",
    appearance: { system: "System theme", light: "Light", dark: "Dark" }[userPrefersMode.current ?? "system"],
    insights: insightsValue,
    plugins: $pluginSettings.communityPluginsEnabled ? "Community plugins on" : "Community plugins off",
    data: "Export, restore, import",
    about: "Privacy, terms, diagnostics",
  });

  function formatAgo(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
    return new Date(ms).toLocaleDateString();
  }
  const initials = (name: string) => (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const user = $derived(authStore.isAuthenticated ? authStore.user : null);
  const account = $derived(
    user
      ? {
          name: $profile.name || user.username,
          line: `${apiClient.isSelfHosted() ? "Own server" : user.tier} · ${$lastSyncedAt ? `Backed up ${formatAgo($lastSyncedAt)}` : "Not backed up yet"}`,
          dot: true,
        }
      : getActiveOwnerId()
        ? { name: $profile.name || "No name yet", line: "On this phone only · not backed up", dot: false }
        : { name: "Sign in or make an account", line: "Everything is on this device", dot: false, noAccount: true },
  );

  const isOpen = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + "/");
</script>

<div class="flex flex-col {compact ? 'gap-4' : 'gap-5'}">
  <label class="flex items-center gap-2.5 rounded-[10px] bg-muted px-3 {compact ? 'h-10' : 'h-11'} text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
    <Search class="size-[18px] shrink-0" aria-hidden="true" />
    <span class="sr-only">Search settings</span>
    <input type="search" bind:value={query} placeholder="Search settings"
      class="h-full min-w-0 flex-1 self-stretch bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
    {#if query}
      <button type="button" class="-mr-2 flex size-10 shrink-0 items-center justify-center" aria-label="Clear search" onclick={() => (query = "")}>
        <X class="size-4" />
      </button>
    {/if}
  </label>

  {#if query.trim()}
    {#if results.length === 0}
      <p class="px-1 text-sm text-muted-foreground" in:popIn>No settings match “{query.trim()}”.</p>
    {/if}
    {#each resultGroups as g (g.page)}
      <section in:popIn>
        <h2 class="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.page}</h2>
        <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {#each g.list as r (r.href + r.title)}
            <li>
              <a href={r.href} class="flex min-h-14 items-center gap-3 px-3 py-2 text-inherit no-underline hover:bg-muted/40">
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-[15px] font-medium">{r.title}</span>
                  <span class="text-[13px] text-muted-foreground">{r.detail}</span>
                </span>
                <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
    <a in:popIn href="/settings/account" aria-current={compact && isOpen("/settings/account") ? "page" : undefined}
      class="flex items-center gap-3 text-inherit no-underline {compact
        ? 'min-h-14 rounded-lg px-2 hover:bg-muted/50 aria-[current=page]:bg-muted'
        : 'rounded-xl border border-border bg-card px-3 py-3.5 hover:bg-muted/40'}">
      <span class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold {compact ? 'size-9 text-[13px]' : 'size-12 text-base'}">
        {#if "noAccount" in account}
          <User class="size-1/2 text-muted-foreground" aria-hidden="true" />
        {:else if $profile.avatarDataUrl}
          <img src={$profile.avatarDataUrl} alt="" class="size-full object-cover" />
        {:else}
          {initials(account.name)}
        {/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate font-semibold {compact ? 'text-sm' : 'text-base'}">{account.name}</span>
        <span class="flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
          {#if account.dot}<ConnectionDot />{/if}{account.line}
        </span>
      </span>
      {#if !compact}<ChevronRight class="size-4 shrink-0 text-muted-foreground" />{/if}
    </a>

    {#each SETTINGS_GROUPS as g (g.label ?? "more")}
      <section in:popIn>
        {#if g.label}
          <h2 class="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
        {/if}
        <ul class={compact ? "flex flex-col" : "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"}>
          {#each g.pages as p (p.id)}
            {@const Icon = ICONS[p.id as keyof typeof ICONS]}
            <li>
              {#if compact}
                <a href={p.href} aria-current={isOpen(p.href) ? "page" : undefined}
                  class="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-muted/50 hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground">
                  <Icon class="size-4 shrink-0" aria-hidden="true" />{p.title}
                </a>
              {:else}
                <a href={p.href} class="flex min-h-14 items-center gap-3 px-3 py-2 text-inherit no-underline hover:bg-muted/40">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                    <Icon class="size-[17px]" aria-hidden="true" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="text-[15px] font-medium">{p.title}</span>
                    {#if values[p.id]}<span class="truncate text-[13px] text-muted-foreground">{values[p.id]}</span>{/if}
                  </span>
                  <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
                </a>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
