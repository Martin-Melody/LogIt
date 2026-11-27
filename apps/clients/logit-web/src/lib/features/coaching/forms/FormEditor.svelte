<!-- The one form editor (canvas F2): the start-up form, check-in forms, and (mode "ask") the
     questions people answer when they ask to be coached. Questions on the left, each opening to
     edit in place; what the client sees on the right. Saves as you go. -->
<script lang="ts">
  import { parseQuestionPack, type PackQuestion } from "@logit/core/plugins/questionPack";
  import { plugins, fetchSource } from "$lib/features/plugins/pluginData.svelte";
  import type { CheckinAnswer, CheckinQuestion, CheckinSchedule, Measurement } from "@logit/core/domain/Checkin";
  import { MEASUREMENTS, addQuestion, readyMadeForm, removeQuestion, touchCheckinSchedule, updateQuestion } from "@logit/core/domain/Checkin";
  import { createId } from "@logit/core/domain/ids";
  import { apiClient } from "@logit/core/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import OptionSelect from "$lib/components/option-select.svelte";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import XIcon from "@lucide/svelte/icons/x";
  import QuestionField from "./QuestionField.svelte";

  let {
    form = $bindable(),
    mode = "form",
    note = "",
    clientName = "your client",
    saving = false,
    onchange,
  }: {
    form: CheckinSchedule;
    /** "ask": only written and choice answers (the ask sheet), no headings or "saves into". */
    mode?: "form" | "ask";
    /** Under the name: what this form is for. */
    note?: string;
    clientName?: string;
    saving?: boolean;
    onchange: (next: CheckinSchedule) => void;
  } = $props();

  // The preview speaks to the client, so it names you as they'd see you.
  const myName = apiClient.getUser()?.displayName?.split(" ")[0] || apiClient.getUser()?.username || "your coach";
  let open = $state<string | null>(null);
  // The preview can be filled in, to try it; nothing is saved.
  let preview = $state<Record<string, Omit<CheckinAnswer, "questionId">>>({});
  function setPreview(id: string, v: Omit<CheckinAnswer, "questionId">) {
    preview = { ...preview, [id]: v };
  }

  type Kind = { id: string; label: string; group: string; make: () => Omit<CheckinQuestion, "id"> };
  const KINDS: Kind[] = [
    { id: "short", label: "Short text", group: "Answers", make: () => ({ prompt: "New question", type: "text" }) },
    { id: "long", label: "Long text", group: "Answers", make: () => ({ prompt: "New question", type: "text", long: true }) },
    { id: "number", label: "Number", group: "Answers", make: () => ({ prompt: "New question", type: "number" }) },
    { id: "scale", label: "Scale 1–10", group: "Answers", make: () => ({ prompt: "New question", type: "scale", scaleMin: 1, scaleMax: 10 }) },
    { id: "boolean", label: "Yes / No", group: "Answers", make: () => ({ prompt: "New question", type: "boolean" }) },
    { id: "one", label: "Choose one", group: "Answers", make: () => ({ prompt: "New question", type: "choice", options: ["Option 1", "Option 2"] }) },
    { id: "several", label: "Choose several", group: "Answers", make: () => ({ prompt: "New question", type: "choice", multi: true, options: ["Option 1", "Option 2"] }) },
    { id: "weight", label: "Body weight", group: "Their body", make: () => ({ prompt: "Body weight", type: "weight" }) },
    { id: "measurement", label: "Measurement", group: "Their body", make: () => ({ prompt: "Waist", type: "measurement", measure: "waist" }) },
    { id: "photos", label: "Progress photos", group: "Their body", make: () => ({ prompt: "Progress photos", type: "photo", poses: ["Front", "Side", "Back"] }) },
    { id: "photo", label: "One photo", group: "Their body", make: () => ({ prompt: "Photo", type: "photo" }) },
    { id: "heading", label: "Heading or instructions", group: "Other", make: () => ({ prompt: "About your food", type: "heading" }) },
  ];
  const kinds = $derived(mode === "ask" ? KINDS.filter((k) => ["short", "long", "one"].includes(k.id)) : KINDS);

  function kindOf(q: CheckinQuestion): string {
    if (q.type === "text") return q.long ? "long" : "short";
    if (q.type === "choice") return q.multi ? "several" : "one";
    if (q.type === "photo") return q.poses?.length ? "photos" : "photo";
    return q.type;
  }

  const save = (next: CheckinSchedule) => {
    form = next;
    onchange(next);
  };
  const patch = (q: CheckinQuestion, p: Partial<Omit<CheckinQuestion, "id">>) => save(updateQuestion(form, q.id, p));

  function add(kind: Kind) {
    const next = addQuestion(form, kind.make());
    save(next);
    open = next.questions.at(-1)!.id;
  }

  // Canvas W8/W9: questions from your installed question packs (a climbing plugin's "Finger pain").
  let packQuestions = $state<{ pack: string; questions: PackQuestion[] }[]>([]);
  $effect(() => {
    if (mode !== "form") return;
    void (async () => {
      if (!plugins.installsLoaded) await plugins.loadInstalls().catch(() => {});
      const packs = plugins.installed.filter((p) => p.enabled && p.manifest.family === "question-pack");
      packQuestions = (await Promise.all(packs.map(async (p) => {
        try { return { pack: p.manifest.name, questions: parseQuestionPack(JSON.parse(await fetchSource(p.manifest as never)), p.manifest.id).questions }; }
        catch { return null; }
      }))).filter((x): x is NonNullable<typeof x> => !!x);
    })();
  });
  function addFromPack(q: PackQuestion) {
    const next = addQuestion(form, { ...q });
    save(next);
    open = next.questions.at(-1)!.id;
  }

  function addHealth() {
    const extra = readyMadeForm("health").questions.map((q) => ({ ...q, id: createId("ckq") }));
    save(touchCheckinSchedule({ ...form, questions: [...form.questions, ...extra] }));
  }

  function changeKind(q: CheckinQuestion, id: string) {
    const k = KINDS.find((x) => x.id === id)!;
    const made = k.make();
    // Keep what they wrote; take the new type's shape.
    patch(q, { ...made, prompt: q.prompt, help: q.help, required: q.required, long: made.long, multi: made.multi, options: made.options ?? undefined, measure: made.measure, poses: made.poses });
  }

  function move(i: number, by: -1 | 1) {
    const qs = [...form.questions];
    const [q] = qs.splice(i, 1);
    qs.splice(i + by, 0, q!);
    save(touchCheckinSchedule({ ...form, questions: qs }));
  }

  function duplicate(q: CheckinQuestion) {
    const i = form.questions.findIndex((x) => x.id === q.id);
    const copy = { ...q, id: createId("ckq") };
    const qs = [...form.questions];
    qs.splice(i + 1, 0, copy);
    save(touchCheckinSchedule({ ...form, questions: qs }));
    open = copy.id;
  }

  function setOption(q: CheckinQuestion, i: number, value: string) {
    const opts = [...(q.options ?? [])];
    opts[i] = value;
    patch(q, { options: opts });
  }

  const summary = (q: CheckinQuestion) =>
    q.type === "heading" ? "Heading"
      : q.type === "choice" ? `${q.multi ? "Choose several" : "Choose one"} · ${q.options?.length ?? 0} options`
      : q.type === "weight" ? "Body weight, kg"
      : q.type === "measurement" ? `${q.measure ?? "waist"}, cm`
      : q.type === "photo" ? (q.poses?.length ? `Photos · ${q.poses.join(", ").toLowerCase()}` : "One photo")
      : KINDS.find((k) => k.id === kindOf(q))?.label ?? q.type;
</script>

<div data-guide="checkin-form-editor" class="flex flex-wrap items-start gap-6">
  <div class="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label for="form-name">Form name</Label>
      <span class="flex items-center gap-3">
        <Input id="form-name" value={form.name} maxlength={80} oninput={(e) => save(touchCheckinSchedule({ ...form, name: e.currentTarget.value }))} class="max-w-md text-base font-semibold" />
        <span class="text-xs text-muted-foreground" aria-live="polite">{saving ? "Saving…" : "Saved"}</span>
      </span>
      {#if note}<p class="text-xs text-muted-foreground">{note}</p>{/if}
    </div>

    <ol class="flex flex-col gap-1.5">
      {#each form.questions as q, i (q.id)}
        <li class="rounded-[10px] border transition-colors {open === q.id ? 'border-primary/40 bg-card' : 'border-border bg-card'}">
          <div class="flex items-center gap-2 px-3 py-2.5">
            <span class="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
            <button type="button" class="flex min-w-0 flex-1 flex-col text-left" aria-expanded={open === q.id} onclick={() => (open = open === q.id ? null : q.id)}>
              <span class="truncate text-[13px] font-medium">{q.prompt}</span>
              <span class="text-xs text-muted-foreground">{summary(q)}{q.type !== "heading" ? (q.required ? " · Required" : " · Optional") : ""}</span>
            </button>
            <Button variant="ghost" size="icon" class="size-8" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><ArrowUpIcon class="size-4" /></Button>
            <Button variant="ghost" size="icon" class="size-8" aria-label="Move down" disabled={i === form.questions.length - 1} onclick={() => move(i, 1)}><ArrowDownIcon class="size-4" /></Button>
          </div>
          {#if open === q.id}
            <div class="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5 sm:col-span-2">
                <Label for="prompt-{q.id}">{q.type === "heading" ? "Heading" : "Question"}</Label>
                <Input id="prompt-{q.id}" value={q.prompt} maxlength={160} oninput={(e) => patch(q, { prompt: e.currentTarget.value })} />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="kind-{q.id}">Answer type</Label>
                <OptionSelect id="kind-{q.id}" value={kindOf(q)} options={kinds.map((k) => ({ value: k.id, label: k.label, group: k.group }))} onValueChange={(v) => changeKind(q, v)} />
              </div>
              {#if q.type === "measurement"}
                <div class="flex flex-col gap-1.5">
                  <Label for="measure-{q.id}">Which</Label>
                  <OptionSelect id="measure-{q.id}" value={q.measure ?? "waist"} options={MEASUREMENTS.map((m) => ({ value: m, label: m[0]!.toUpperCase() + m.slice(1) }))}
                    onValueChange={(v) => patch(q, { measure: v as Measurement, prompt: v[0]!.toUpperCase() + v.slice(1) })} />
                </div>
              {/if}
              {#if q.type === "choice"}
                <div class="flex flex-col gap-1.5 sm:col-span-2">
                  <span class="text-sm font-medium">Answers to pick from</span>
                  {#each q.options ?? [] as o, k (k)}
                    <span class="flex items-center gap-2">
                      <Input value={o} maxlength={60} aria-label="Answer {k + 1}" oninput={(e) => setOption(q, k, e.currentTarget.value)} class="max-w-xs" />
                      <Button variant="ghost" size="icon" class="size-8" aria-label="Remove answer {k + 1}" disabled={(q.options?.length ?? 0) <= 2}
                        onclick={() => patch(q, { options: (q.options ?? []).filter((_, n) => n !== k) })}><XIcon class="size-4" /></Button>
                    </span>
                  {/each}
                  <Button variant="outline" size="sm" class="self-start" disabled={(q.options?.length ?? 0) >= 10}
                    onclick={() => patch(q, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}>Add an answer</Button>
                </div>
              {/if}
              {#if q.type !== "heading"}
                <div class="flex flex-col gap-1.5 sm:col-span-2">
                  <Label for="help-{q.id}">Help text <span class="font-normal text-muted-foreground">optional</span></Label>
                  <Input id="help-{q.id}" value={q.help ?? ""} maxlength={200} oninput={(e) => patch(q, { help: e.currentTarget.value || undefined })} />
                </div>
                <label class="flex items-center gap-2.5 text-sm"><Switch checked={!!q.required} onCheckedChange={(v) => patch(q, { required: v })} />Required</label>
              {:else}
                <div class="flex flex-col gap-1.5 sm:col-span-2">
                  <Label for="help-{q.id}">Instructions <span class="font-normal text-muted-foreground">optional</span></Label>
                  <Input id="help-{q.id}" value={q.help ?? ""} maxlength={300} oninput={(e) => patch(q, { help: e.currentTarget.value || undefined })} />
                </div>
              {/if}
              <div class="flex gap-2 sm:col-span-2 sm:justify-end">
                <Button variant="outline" size="sm" onclick={() => duplicate(q)}>Duplicate</Button>
                <Button variant="outline" size="sm" class="text-destructive" disabled={mode === "ask" && form.questions.length <= 1}
                  onclick={() => { save(removeQuestion(form, q.id)); open = null; }}>Remove</Button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ol>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}<Button {...props} variant="outline" class="self-start" disabled={mode === "ask" && form.questions.length >= 12}>Add a question</Button>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-60">
        {#each [...new Set(kinds.map((k) => k.group))] as group (group)}
          <DropdownMenu.Group>
            <DropdownMenu.Label>{group}</DropdownMenu.Label>
            {#each kinds.filter((k) => k.group === group) as k (k.id)}
              <DropdownMenu.Item onSelect={() => add(k)}>{k.label}</DropdownMenu.Item>
            {/each}
          </DropdownMenu.Group>
        {/each}
        {#if mode === "form"}
          <DropdownMenu.Separator />
          <DropdownMenu.Label>Ready-made</DropdownMenu.Label>
          <DropdownMenu.Item onSelect={addHealth}>Health questions (4)</DropdownMenu.Item>
          {#each packQuestions as p (p.pack)}
            <DropdownMenu.Separator />
            <DropdownMenu.Label>From {p.pack}</DropdownMenu.Label>
            {#each p.questions as q, i (i)}<DropdownMenu.Item onSelect={() => addFromPack(q)}>{q.prompt}</DropdownMenu.Item>{/each}
          {/each}
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <p class="text-xs text-muted-foreground">Changes apply from now on. Answers already sent keep the questions they were asked.</p>
  </div>

  <aside class="sticky top-6 flex w-full max-w-[380px] flex-[1_1_300px] flex-col gap-2" aria-label="Preview">
    <span class="text-xs font-medium text-muted-foreground">What {clientName} sees</span>
    <div class="flex flex-col gap-4 rounded-[28px] border-[8px] border-muted bg-background p-4">
      <h3 class="text-base font-bold">{form.name || "Untitled form"}</h3>
      {#each form.questions as q (q.id)}
        <QuestionField {q} answer={preview[q.id] ? { questionId: q.id, ...preview[q.id] } : undefined} onchange={(v) => setPreview(q.id, v)} coachName={myName} />
      {/each}
    </div>
  </aside>
</div>
