<script lang="ts">
  import { X, Loader2 } from "lucide-svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { socialApi, type ReportReason, type ReportTargetType } from "@logit/core/api/socialApi";
  import { toast } from "svelte-sonner";

  interface Props {
    open: boolean;
    targetType: ReportTargetType;
    targetId: string;
    /** e.g. "post", "comment", "@bob" — shown in the sheet title. */
    what: string;
    onclose: () => void;
    onreported?: () => void;
  }

  const { open, targetType, targetId, what, onclose, onreported }: Props = $props();

  const REASONS: { value: ReportReason; label: string }[] = [
    { value: "Spam", label: "Spam or scam" },
    { value: "Harassment", label: "Harassment or bullying" },
    { value: "HateSpeech", label: "Hate speech" },
    { value: "Violence", label: "Violence or threats" },
    { value: "SexualContent", label: "Sexual or explicit content" },
    { value: "SelfHarm", label: "Self-harm" },
    { value: "Misinformation", label: "False information" },
    { value: "Other", label: "Something else" },
  ];

  let reason = $state<ReportReason | null>(null);
  let note = $state("");
  let submitting = $state(false);

  $effect(() => {
    if (open) {
      reason = null;
      note = "";
      openOverlay();
      return () => closeOverlay();
    }
  });

  async function submit() {
    if (!reason || submitting) return;
    submitting = true;
    try {
      await socialApi.reportContent(targetType, targetId, reason, note.trim() || undefined);
      toast.success("Report sent. Thanks — our team will review it.");
      onreported?.();
      onclose();
    } catch {
      toast.error("Couldn't send the report. Try again.");
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <button type="button" class="fixed inset-0 bg-black/40 z-40" aria-label="Close" onclick={onclose}></button>

  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl border-t border-border max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <p class="text-sm font-semibold">Report {what}</p>
      <button type="button" class="p-1 text-muted-foreground" onclick={onclose} aria-label="Close">
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="overflow-y-auto px-4 py-3 flex flex-col gap-1">
      <p class="text-xs text-muted-foreground mb-1">Why are you reporting this?</p>
      {#each REASONS as r (r.value)}
        <label class="flex items-center gap-3 py-2.5 text-sm cursor-pointer">
          <input type="radio" name="reason" value={r.value} bind:group={reason} class="accent-primary" />
          {r.label}
        </label>
      {/each}

      <textarea
        bind:value={note}
        rows={3}
        maxlength={1000}
        placeholder="Add any detail (optional)"
        class="mt-2 resize-none rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      ></textarea>
    </div>

    <div class="px-4 py-3 border-t border-border shrink-0">
      <button
        type="button"
        class="w-full flex items-center justify-center gap-2 rounded bg-primary text-primary-foreground text-sm font-medium py-2.5 disabled:opacity-50"
        disabled={!reason || submitting}
        onclick={submit}
      >
        {#if submitting}<Loader2 class="h-4 w-4 animate-spin" />{/if}
        Submit report
      </button>
    </div>
  </div>
{/if}
