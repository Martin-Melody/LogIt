<!-- Settings › Backup & import: a backup file, restoring one, importing from other apps, and (with
     no account) deleting everything on this phone. Deleting an account is on the Account page. -->
<script lang="ts">
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import DeleteAccountPanel from "$lib/features/settings/DeleteAccountPanel.svelte";
  import ImportExportPanel from "$lib/features/importExport/ImportExportPanel.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
</script>

<SettingsPage title="Backup & import">
  <ImportExportPanel />
  {#if !authStore.isAuthenticated}
    <DeleteAccountPanel />
  {/if}
</SettingsPage>
