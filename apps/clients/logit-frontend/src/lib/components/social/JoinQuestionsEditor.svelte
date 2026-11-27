<!-- A group's join questions (canvas K8): written answers or a choice, each optional or not.
     Asked when someone asks to join; only organisers and moderators see the answers. The same
     shape as a coach's ask questions (no "saves into their LogIt" types). -->
<script lang="ts">
  import { Plus, Trash2, X } from "lucide-svelte";
  import type { AskQuestion } from "@logit/core/domain/coachRequest";
  import { createId } from "@logit/core/domain/ids";
  import { Input } from "$lib/components/ui/input";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { addButton, segment, segmentTrack } from "$lib/components/ui/choice";

  let { questions = $bindable([]) }: { questions: AskQuestion[] } = $props();
  const MAX = 12;
  const MAX_OPTIONS = 10;

  const update = (i: number, patch: Partial<AskQuestion>) => (questions = questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const add = () => (questions = [...questions, { id: createId("q"), label: "", kind: "text", options: null, optional: false }]);
  const remove = (i: number) => (questions = questions.filter((_, k) => k !== i));
  const setKind = (i: number, kind: "text" | "choice") =>
    update(i, { kind, options: kind === "choice" ? (questions[i].options?.length ? questions[i].options : ["", ""]) : null });
  const setOption = (i: number, o: number, value: string) => update(i, { options: (questions[i].options ?? []).map((x, k) => (k === o ? value : x)) });
</script>

<div class="flex flex-col gap-3">
  {#each questions as q, i (q.id)}
    <div class="flex flex-col gap-2.5 rounded-xl border border-border p-3">
      <div class="flex items-start gap-2">
        <Input value={q.label} maxlength={160} placeholder="Where do you train?" aria-label="Question {i + 1}" class="h-11 flex-1 text-[15px]"
          oninput={(e) => update(i, { label: e.currentTarget.value })} />
        <button type="button" aria-label="Remove question {i + 1}" class="flex size-11 shrink-0 items-center justify-center text-muted-foreground" onclick={() => remove(i)}><Trash2 class="size-[18px]" /></button>
      </div>
      <div class={segmentTrack} role="radiogroup" aria-label="Answer for question {i + 1}">
        <button type="button" role="radio" aria-checked={q.kind === "text"} class={segment(q.kind === "text")} onclick={() => setKind(i, "text")}>Written</button>
        <button type="button" role="radio" aria-checked={q.kind === "choice"} class={segment(q.kind === "choice")} onclick={() => setKind(i, "choice")}>Pick one</button>
      </div>
      {#if q.kind === "choice"}
        <div class="flex flex-col gap-2">
          {#each q.options ?? [] as o, k (k)}
            <div class="flex items-center gap-2">
              <Input value={o} maxlength={60} placeholder={k === 0 ? "Yes" : k === 1 ? "Not yet" : "Another answer"} aria-label="Answer {k + 1}" class="h-11 flex-1 text-[15px]"
                oninput={(e) => setOption(i, k, e.currentTarget.value)} />
              {#if (q.options?.length ?? 0) > 2}
                <button type="button" aria-label="Remove answer {k + 1}" class="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
                  onclick={() => update(i, { options: (q.options ?? []).filter((_, x) => x !== k) })}><X class="size-[18px]" /></button>
              {/if}
            </div>
          {/each}
          {#if (q.options?.length ?? 0) < MAX_OPTIONS}
            <button type="button" class="{addButton} self-start" onclick={() => update(i, { options: [...(q.options ?? []), ""] })}><Plus class="size-4" />Add an answer</button>
          {/if}
        </div>
      {/if}
      <div class="flex min-h-11 items-center justify-between gap-3">
        <span class="text-[14px]">Optional</span>
        <Switch checked={q.optional} label="Question {i + 1} is optional" onchange={(v) => update(i, { optional: v })} />
      </div>
    </div>
  {/each}
  {#if questions.length < MAX}
    <button type="button" class="{addButton} self-start" onclick={add}><Plus class="size-4" />{questions.length ? "Add a question" : "Ask a question"}</button>
  {/if}
</div>
