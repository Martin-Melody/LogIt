<!-- Settings: search, the account card and one row per page (lib/features/settings). On a wide
     screen that list is the sidebar (+layout.svelte), so this opens Account beside it. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import SettingsNav from "$lib/features/settings/SettingsNav.svelte";
  import { legacySettingsHref } from "$lib/features/settings/settingsIndex";
  import { back } from "$lib/navigation";

  onMount(() => {
    // Links from before Settings had pages: /settings#sec-progression and the like.
    const to = legacySettingsHref(page.url.hash, page.url.search)
      ?? (matchMedia("(min-width: 1024px)").matches ? "/settings/account" : null);
    if (to) void goto(to, { replaceState: true });
  });
</script>

<PageHeader>
  <BackButton onclick={() => back("/profile")} />
  <h1 class="page-title">Settings</h1>
</PageHeader>

<div class="p-3 pb-24 lg:hidden">
  <SettingsNav />
</div>
