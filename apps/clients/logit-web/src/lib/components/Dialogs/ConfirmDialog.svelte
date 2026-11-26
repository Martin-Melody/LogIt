<!-- "Are you sure?" on AlertDialog, instead of the browser's confirm(). Set `ask` to show it. -->
<script lang="ts" module>
  export type Ask = { title: string; text?: string; action: string; run: () => void };
</script>

<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";

  let { ask = $bindable(null) }: { ask: Ask | null } = $props();
</script>

<AlertDialog.Root open={ask !== null} onOpenChange={(o) => { if (!o) ask = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{ask?.title}</AlertDialog.Title>
      {#if ask?.text}<AlertDialog.Description>{ask.text}</AlertDialog.Description>{/if}
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive"
        onclick={() => { const run = ask?.run; ask = null; run?.(); }}>{ask?.action}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
