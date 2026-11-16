<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type ReportReason, type ReportTargetType } from "@logit/core/api/socialApi";

  let { open = $bindable(false), targetType, targetId, what }: {
    open?: boolean; targetType: ReportTargetType; targetId: string; what: string;
  } = $props();

  const REASONS: [ReportReason, string][] = [
    ["Spam", "Spam"], ["Harassment", "Harassment or bullying"], ["HateSpeech", "Hate speech"],
    ["Violence", "Violence or threats"], ["SexualContent", "Sexual content"], ["SelfHarm", "Self-harm"],
    ["Misinformation", "False information"], ["Other", "Something else"],
  ];
  let reason = $state<ReportReason | null>(null);
  let note = $state("");
  let sending = $state(false);

  $effect(() => { if (open) { reason = null; note = ""; } });

  async function send() {
    if (!reason || sending) return;
    sending = true;
    try {
      await socialApi.reportContent(targetType, targetId, reason, note.trim() || undefined);
      toast.success("Thanks. We'll look at it.");
      open = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the report");
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[440px]">
    <Dialog.Header>
      <Dialog.Title>Report {what}</Dialog.Title>
      <Dialog.Description>What's wrong with it? Reports go to the LogIt team, not the person.</Dialog.Description>
    </Dialog.Header>
    <div role="radiogroup" aria-label="Reason" class="flex flex-col gap-1">
      {#each REASONS as [value, label] (value)}
        <label class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
          <input type="radio" name="report-reason" checked={reason === value} onchange={() => (reason = value)} class="accent-primary" />
          {label}
        </label>
      {/each}
    </div>
    <label for="report-note" class="text-xs text-muted-foreground">More detail (optional)</label>
    <textarea id="report-note" bind:value={note} rows="2" maxlength="500"
      class="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"></textarea>
    <Dialog.Footer>
      <button type="button" onclick={() => (open = false)} class="h-[34px] rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
      <button type="button" disabled={!reason || sending} onclick={send}
        class="h-[34px] rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send report</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
