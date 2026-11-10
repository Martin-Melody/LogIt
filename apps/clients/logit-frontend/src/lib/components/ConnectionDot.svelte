<script lang="ts">
  import { connectionStatus, type ConnectionState } from "@logit/core/api/connectionStatus.svelte";

  const DOT: Record<ConnectionState, { color: string; label: string }> = {
    connected:    { color: "bg-success",           label: "Connected" },
    disconnected: { color: "bg-destructive",             label: "Can't reach server" },
    unknown:      { color: "bg-muted-foreground/40", label: "Connection unknown" },
  };

  const dot = $derived(DOT[connectionStatus.state]);
</script>

<span
  title={dot.label}
  aria-label={dot.label}
  class="inline-block h-2 w-2 rounded-full shrink-0 {dot.color}"
></span>
