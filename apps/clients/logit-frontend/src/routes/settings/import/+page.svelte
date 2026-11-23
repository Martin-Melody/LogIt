<script lang="ts">
  // Settings › Backup & import › Import workouts. A CSV shared to LogIt lands here too
  // (?shared=…, set by nativeShell).
  import { page } from "$app/state";
  import { back } from "$lib/navigation";
  import ImportFlow from "$lib/features/import/ImportFlow.svelte";
</script>

<div class="mx-auto flex min-h-full w-full max-w-md flex-col bg-background px-5 pb-24 pt-6 text-foreground">
  <ImportFlow onexit={() => back("/settings/data")} exitLabel="Settings" shared={page.url.searchParams.get("shared")} />
</div>
