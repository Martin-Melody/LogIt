<!-- Canvas W6: a quick look at a check-in on the phone: the answers (with last time's), a reply
     and Send and mark reviewed. The full review, with their week beside it, is on the web. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import { coachApi } from "@logit/core/api/coachApi";
  import { questionsFor } from "@logit/core/domain/Checkin";
  import { answerText } from "@logit/core/domain/coachCards";
  import type { CheckinReplyCard } from "@logit/core/domain/savedReplies";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";
  import { authStore } from "$lib/api/authStore.svelte";
  import SavedReplyPicker from "./SavedReplyPicker.svelte";
  import type { CheckinRow } from "./coachToday";

  let { row, webUrl, ondone, onclose }: { row: CheckinRow | null; webUrl: string; ondone: () => void; onclose: () => void } = $props();
  let reply = $state("");
  let busy = $state(false);
  let picking = $state(false);
  $effect(() => { void row; reply = ""; });

  const qs = $derived(row ? questionsFor(row.submission, row.schedule).filter((q) => q.type !== "photo") : []);
  const get = (s: NonNullable<CheckinRow["previous"]> | CheckinRow["submission"], id: string) => s.answers.find((a) => a.questionId === id);
  const sessions = $derived(row && row.roster.sharing?.workouts !== false ? `${row.roster.sessions7d} session${row.roster.sessions7d === 1 ? "" : "s"} in 7 days` : "");

  async function send() {
    if (!row || busy) return;
    busy = true;
    try {
      const text = reply.trim();
      if (text) {
        const card: CheckinReplyCard = { scheduleName: row.schedule?.name ?? "Check-in", periodStartMs: row.submission.periodStartMs, submissionId: row.item.id };
        await sendMessage(row.item.relationshipId, text, undefined, undefined, { kind: "checkin-reply", json: JSON.stringify(card) });
      }
      await coachApi.setCheckinReviewed(row.item.clientUserId, row.item.id, true, text || undefined);
      toast.success(text ? "Reply sent, marked as reviewed" : "Marked as reviewed");
      ondone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root open={!!row} onOpenChange={(o) => { if (!o) onclose(); }}>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3 overflow-y-auto p-4 sm:max-w-[420px]">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>{row.name} · {row.schedule?.name ?? "Check-in"}</Dialog.Title>
        <Dialog.Description>{new Date(row.item.submittedAtMs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}{sessions ? ` · ${sessions}` : ""}</Dialog.Description>
      </Dialog.Header>
      <dl class="flex flex-col">
        {#each qs as q (q.id)}
          {@const now = answerText(q, get(row.submission, q.id))}
          {@const was = row.previous && (q.type === "scale" || q.type === "weight" || q.type === "measurement" || q.type === "number") ? answerText(q, get(row.previous, q.id)) : null}
          <dt class="border-t border-border pt-2.5 text-[13px] text-muted-foreground">{q.prompt}</dt>
          <dd class="pb-2.5 text-[15px] whitespace-pre-wrap">{now}{#if was && was !== "–" && was !== now}<span class="text-[13px] text-muted-foreground"> (was {was})</span>{/if}</dd>
        {/each}
      </dl>
      <SavedReplyPicker bind:draft={reply} bind:open={picking} fill={{ firstName: row.name, coachName: authStore.user?.displayName || authStore.user?.username || null }} />
      <label for="quick-reply" class="sr-only">Reply to {row.name}</label>
      <textarea id="quick-reply" rows="3" bind:value={reply} placeholder="Reply (type / for a saved reply)"
        class="w-full rounded-[12px] border border-input bg-background px-3 py-2.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
      <div class="flex flex-wrap gap-2">
        <Button class="h-12 flex-1" disabled={busy} onclick={() => void send()}>{reply.trim() ? "Send and mark reviewed" : "Mark reviewed"}</Button>
        <Button variant="outline" class="h-12" onclick={() => (picking = !picking)}>Saved replies</Button>
      </div>
      <Button variant="ghost" class="h-11" href="{webUrl}/coaching/checkins?id={encodeURIComponent(row.item.id)}&client={row.item.clientUserId}" target="_blank" rel="noopener">Full review on the web</Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
