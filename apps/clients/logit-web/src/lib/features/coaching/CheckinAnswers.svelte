<script lang="ts">
  import type { CheckinAnswer, CheckinQuestion, CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";

  // A submitted check-in's answers in the order of its form. Short answers (numbers, scales,
  // yes/no, weight) sit side by side; text and photos get a row each.

  let { schedule, submission, previous = null }: {
    schedule: CheckinSchedule | null;
    submission: CheckinSubmission;
    /** The client's previous submitted check-in on the same form, for the weight change. */
    previous?: CheckinSubmission | null;
  } = $props();

  type Row = { q: CheckinQuestion; a: CheckinAnswer | undefined };

  const rows = $derived.by((): Row[] => {
    const qs = schedule?.questions ?? submission.answers.map((a) => ({ id: a.questionId, prompt: "Answer", type: "text" as const }));
    return qs.map((q) => ({ q, a: submission.answers.find((x) => x.questionId === q.id) }));
  });
  const short = $derived(rows.filter((r) => ["number", "scale", "boolean", "weight"].includes(r.q.type)));
  const long = $derived(rows.filter((r) => !["number", "scale", "boolean", "weight"].includes(r.q.type)));

  function value(r: Row): string {
    const a = r.a;
    if (!a) return "–";
    switch (r.q.type) {
      case "boolean": return a.bool === undefined ? "–" : a.bool ? "Yes" : "No";
      case "weight": return a.number === undefined ? "–" : `${a.number} kg`;
      case "scale": return a.number === undefined ? "–" : `${a.number} / ${r.q.scaleMax ?? 10}`;
      default: return a.number === undefined ? (a.text ?? "–") : String(a.number);
    }
  }

  function weightChange(r: Row): string {
    if (r.q.type !== "weight" || r.a?.number === undefined || !previous) return "";
    const before = previous.answers.find((x) => x.questionId === r.q.id)?.number;
    if (before === undefined) return "";
    const d = Math.round((r.a.number - before) * 10) / 10;
    return d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${Math.abs(d)} kg`;
  }
</script>

<div class="flex flex-col">
  {#if short.length}
    <div class="flex flex-wrap gap-x-7 gap-y-3 border-t border-border py-3">
      {#each short as r (r.q.id)}
        <span class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">{r.q.prompt}</span>
          <span class="text-sm font-medium">{value(r)}{#if weightChange(r)}<span class="text-xs font-normal text-muted-foreground">{` · ${weightChange(r)}`}</span>{/if}</span>
        </span>
      {/each}
    </div>
  {/if}
  {#each long as r (r.q.id)}
    <div class="flex flex-col gap-1 border-t border-border py-3">
      <span class="text-xs text-muted-foreground">{r.q.prompt}</span>
      {#if r.q.type === "photo"}
        {#if r.a?.photoDataUrl}
          <a href={r.a.photoDataUrl} target="_blank" rel="noopener" class="w-fit"><img src={r.a.photoDataUrl} alt={r.q.prompt} class="max-h-44 rounded-lg border border-border" /></a>
        {:else}
          <span class="text-sm text-muted-foreground">No photo</span>
        {/if}
      {:else}
        <span class="whitespace-pre-wrap text-sm leading-relaxed">{r.a?.text || "–"}</span>
      {/if}
    </div>
  {/each}
</div>
