<script lang="ts">
  import { CloudOff, Loader2 } from "lucide-svelte";
  import { currentServerName } from "$lib/accounts/moveServer";
  import { syncAll } from "$lib/sync/syncService";
  import type { FirstDownload } from "./firstDownload";

  /** The card at the top of Home or Nutrition while the account's data is still on its way. */
  const {
    status,
    subject,
    detail,
  }: {
    status: Exclude<FirstDownload, null>;
    /** "training", "diary": what's on its way. */
    subject: string;
    /** What it covers, and what can be done meanwhile. */
    detail: string;
  } = $props();

  const server = currentServerName();
  let retrying = $state(false);

  async function retry() {
    retrying = true;
    try {
      await syncAll();
    } catch {
      // The card stays on "couldn't reach" until a sync gets through.
    } finally {
      retrying = false;
    }
  }
</script>

<section
  role="status"
  class="flex items-center gap-3 rounded-2xl border bg-muted px-3.5 py-3 {status === 'failed'
    ? 'border-warning/35'
    : 'border-border'}"
  data-testid="first-download"
>
  {#if status === "loading"}
    <Loader2 class="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="text-sm font-semibold">Getting your {subject} from {server}…</p>
      <p class="text-xs text-muted-foreground">{detail}</p>
    </div>
  {:else}
    <CloudOff class="size-5 shrink-0 text-warning" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <p class="text-sm font-semibold">Couldn't reach {server}</p>
      <p class="text-xs text-muted-foreground">Your {subject} will show here once you're back online.</p>
    </div>
    <button
      type="button"
      class="h-11 shrink-0 rounded-lg border border-border px-3.5 text-sm font-medium disabled:opacity-50"
      disabled={retrying}
      onclick={() => void retry()}
    >
      Retry
    </button>
  {/if}
</section>
