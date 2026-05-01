<script lang="ts">
  import {
    Download,
    Upload,
    FileJson,
    Check,
    AlertTriangle,
  } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import {
    exportData,
    downloadExport,
    type ExportData,
  } from "$lib/usecases/exportData";
  import {
    parseExportFile,
    importData,
    type ImportCategories,
  } from "$lib/usecases/importData";
  import { pickTextFile } from "$lib/platform/filePick";

  type Phase =
    | "idle"
    | "exporting"
    | "exported"
    | "picking"
    | "confirming"
    | "importing"
    | "done"
    | "error";

  let phase = $state<Phase>("idle");
  let errorMsg = $state("");
  let parsedData = $state<ExportData | null>(null);

  let categories = $state<ImportCategories>({
    profile: true,
    exercises: true,
    splits: true,
    sessions: true,
    progression: true,
  });

  async function handleExport() {
    phase = "exporting";
    errorMsg = "";
    try {
      const data = await exportData();
      await downloadExport(data);
      phase = "exported";
      setTimeout(() => {
        if (phase === "exported") phase = "idle";
      }, 3000);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Export failed.";
      phase = "error";
    }
  }

  async function handlePickFile() {
    phase = "picking";
    errorMsg = "";
    parsedData = null;
    try {
      const text = await pickTextFile();
      const data = parseExportFile(text);
      parsedData = data;
      categories = {
        profile: true,
        exercises: true,
        splits: true,
        sessions: true,
        progression: true,
      };
      phase = "confirming";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read file.";
      if (msg === "cancelled") {
        phase = "idle";
        return;
      }
      errorMsg = msg;
      phase = "error";
    }
  }

  async function handleImport() {
    if (!parsedData) return;
    phase = "importing";
    errorMsg = "";
    try {
      await importData(parsedData, categories);
      phase = "done";
      parsedData = null;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Import failed.";
      phase = "error";
    }
  }

  function cancelImport() {
    parsedData = null;
    phase = "idle";
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleString();
  }

  function countSummary(data: ExportData) {
    return [
      `${data.exercises.length} exercise${data.exercises.length !== 1 ? "s" : ""}`,
      `${data.splits.splits.length} split${data.splits.splits.length !== 1 ? "s" : ""}`,
      `${data.sessions.length} session${data.sessions.length !== 1 ? "s" : ""}`,
    ].join(", ");
  }

  const categoryLabels: Record<keyof ImportCategories, string> = {
    profile: "Profile & body stats",
    exercises: "Exercise library",
    splits: "Training splits",
    sessions: "Workout history",
    progression: "Progression settings",
  };
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>Backup & Restore</Card.Title>
    <Card.Description>
      Export all your data to a file and import it back when needed.
    </Card.Description>
  </Card.Header>

  <Card.Content class="flex flex-col gap-4">
    <!-- Export -->
    <div class="flex flex-col gap-2">
      <p
        class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        Export
      </p>
      <Button
        variant="outline"
        size="sm"
        class="justify-start"
        disabled={phase === "exporting"}
        onclick={() => void handleExport()}
      >
        {#if phase === "exported"}
          <Check class="mr-2 h-3.5 w-3.5 text-green-500" /> Downloaded
        {:else}
          <Download class="mr-2 h-3.5 w-3.5" />
          {phase === "exporting" ? "Exporting…" : "Download backup file"}
        {/if}
      </Button>
    </div>

    <div class="border-t border-border" />

    <!-- Import -->
    <div class="flex flex-col gap-2">
      <p
        class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        Import
      </p>

      {#if phase === "confirming" && parsedData}
        <!-- File parsed — show category picker -->
        <div
          class="rounded border border-border bg-muted/30 p-3 flex flex-col gap-3"
        >
          <div class="flex items-start gap-2">
            <FileJson class="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div class="text-xs text-muted-foreground">
              <p>Backed up on {formatDate(parsedData.exportedAtMs)}</p>
              <p>{countSummary(parsedData)}</p>
            </div>
          </div>

          <div
            class="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-2"
          >
            <AlertTriangle class="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
            <p class="text-xs text-amber-600 dark:text-amber-400">
              Each selected category will fully replace your current data. This
              cannot be undone.
            </p>
          </div>

          <p class="text-xs font-medium">Select what to restore:</p>

          <ul class="flex flex-col gap-2">
            {#each Object.keys(categoryLabels) as key (key)}
              {@const k = key as keyof ImportCategories}
              <li class="flex items-center gap-2">
                <input
                  id="cat-{k}"
                  type="checkbox"
                  class="h-4 w-4 accent-primary"
                  bind:checked={categories[k]}
                />
                <label for="cat-{k}" class="text-sm cursor-pointer select-none">
                  {categoryLabels[k]}
                </label>
              </li>
            {/each}
          </ul>

          <div class="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={!Object.values(categories).some(Boolean)}
              onclick={() => void handleImport()}
            >
              <Upload class="mr-1.5 h-3.5 w-3.5" /> Restore selected
            </Button>
            <Button size="sm" variant="outline" onclick={cancelImport}
              >Cancel</Button
            >
          </div>
        </div>
      {:else if phase === "importing"}
        <p class="text-sm text-muted-foreground">Restoring data…</p>
      {:else if phase === "done"}
        <div
          class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
        >
          <Check class="h-4 w-4" /> Restore complete. You may need to reload the
          app to see your data.
        </div>
      {:else if phase === "error"}
        <div
          class="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-2"
        >
          <AlertTriangle class="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
          <p class="text-xs text-destructive">{errorMsg}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="justify-start self-start"
          onclick={cancelImport}
        >
          Try again
        </Button>
      {:else}
        <Button
          variant="outline"
          size="sm"
          class="justify-start"
          onclick={() => void handlePickFile()}
          disabled={phase === "picking"}
        >
          <Upload class="mr-2 h-3.5 w-3.5" />
          {phase === "picking" ? "Opening file picker…" : "Select backup file…"}
        </Button>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
