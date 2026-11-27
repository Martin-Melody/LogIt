<!-- One question of a coach's form, as the client answers it (canvas F2 "What Aoife sees", J3).
     The same on the client's check-in page and the form editor's preview. -->
<script lang="ts">
  import type { CheckinAnswer, CheckinQuestion } from "@logit/core/domain/Checkin";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { shrinkPhoto } from "$lib/features/coaching/myCoachData";
  import { toast } from "$lib/components/ui/sonner";

  type Value = Omit<CheckinAnswer, "questionId">;

  let {
    q,
    answer,
    onchange,
    disabled = false,
    invalid = false,
    coachName = "your coach",
    weightHint = null,
  }: {
    q: CheckinQuestion;
    answer: CheckinAnswer | undefined;
    onchange: (value: Value) => void;
    disabled?: boolean;
    invalid?: boolean;
    coachName?: string;
    weightHint?: string | null;
  } = $props();

  const pill = (on: boolean) =>
    `h-9 rounded-lg px-3.5 text-[13px] transition-colors ${on ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  async function photo(e: Event, index: number | null) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const url = await shrinkPhoto(file);
      if (index === null) onchange({ photoDataUrl: url });
      else {
        const list = [...(answer?.photoDataUrls ?? q.poses!.map(() => ""))];
        list[index] = url;
        onchange({ photoDataUrls: list });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that photo");
    }
  }

  function removePose(index: number) {
    const list = [...(answer?.photoDataUrls ?? [])];
    list[index] = "";
    onchange({ photoDataUrls: list.some(Boolean) ? list : undefined });
  }

  function toggleChoice(o: string) {
    const now = new Set(answer?.choices ?? []);
    if (now.has(o)) now.delete(o);
    else now.add(o);
    const list = (q.options ?? []).filter((x) => now.has(x));
    onchange({ choices: list.length ? list : undefined });
  }

  const field = "rounded-[9px] border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
</script>

{#if q.type === "heading"}
  <div class="flex flex-col gap-1 pt-1">
    <h3 class="text-[15px] font-semibold">{q.prompt}</h3>
    {#if q.help}<p class="text-[13px] leading-relaxed text-muted-foreground">{q.help}</p>{/if}
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <span id="label-{q.id}" class="text-sm font-medium">
      {q.prompt}{#if q.required}<span class="ml-2 text-xs font-medium text-warning">Required</span>{:else if q.type !== "scale"}<span class="ml-2 text-xs font-normal text-muted-foreground">Optional</span>{/if}
    </span>
    {#if q.help}<span class="-mt-1 text-xs leading-relaxed text-muted-foreground">{q.help}</span>{/if}

    {#if q.type === "text"}
      {#if q.long}
        <Textarea id="q-{q.id}" aria-labelledby="label-{q.id}" rows={4} {disabled} aria-invalid={invalid} value={answer?.text ?? ""} oninput={(e) => onchange({ text: e.currentTarget.value })} />
      {:else}
        <Input id="q-{q.id}" aria-labelledby="label-{q.id}" {disabled} aria-invalid={invalid} value={answer?.text ?? ""} oninput={(e) => onchange({ text: e.currentTarget.value })} />
      {/if}
    {:else if q.type === "number" || q.type === "weight" || q.type === "measurement"}
      <span class="flex items-center gap-2">
        <input id="q-{q.id}" aria-labelledby="label-{q.id}" type="number" step="0.1" inputmode="decimal" {disabled} class="{field} h-[38px] w-32" aria-invalid={invalid}
          value={answer?.number ?? ""} oninput={(e) => onchange({ number: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })} />
        {#if q.type === "weight"}<span class="text-[13px] text-muted-foreground">kg</span>{:else if q.type === "measurement"}<span class="text-[13px] text-muted-foreground">cm</span>{/if}
      </span>
      {#if q.type === "weight" && weightHint}<span class="text-xs text-muted-foreground">{weightHint}</span>{/if}
    {:else if q.type === "scale"}
      {@const min = q.scaleMin ?? 1}
      {@const max = q.scaleMax ?? 10}
      <div role="radiogroup" aria-labelledby="label-{q.id}" class="flex flex-wrap gap-1">
        {#each Array.from({ length: max - min + 1 }, (_, k) => min + k) as n (n)}
          <button type="button" role="radio" id={n === min ? `q-${q.id}` : undefined} aria-checked={answer?.number === n} {disabled} onclick={() => onchange({ number: n })}
            class="{pill(answer?.number === n)} w-[38px] px-0">{n}</button>
        {/each}
      </div>
    {:else if q.type === "boolean"}
      <div role="radiogroup" aria-labelledby="label-{q.id}" class="flex gap-1">
        {#each [{ v: true, l: "Yes" }, { v: false, l: "No" }] as o, k (o.l)}
          <button type="button" role="radio" id={k === 0 ? `q-${q.id}` : undefined} aria-checked={answer?.bool === o.v} {disabled} onclick={() => onchange({ bool: o.v })} class={pill(answer?.bool === o.v)}>{o.l}</button>
        {/each}
      </div>
    {:else if q.type === "choice"}
      {#if q.multi}
        <div role="group" aria-labelledby="label-{q.id}" class="flex flex-wrap gap-1.5">
          {#each q.options ?? [] as o, k (o)}
            {@const on = answer?.choices?.includes(o) ?? false}
            <button type="button" role="checkbox" id={k === 0 ? `q-${q.id}` : undefined} aria-checked={on} {disabled} onclick={() => toggleChoice(o)} class={pill(on)}>{o}</button>
          {/each}
        </div>
      {:else}
        <div role="radiogroup" aria-labelledby="label-{q.id}" class="flex flex-wrap gap-1.5">
          {#each q.options ?? [] as o, k (o)}
            <button type="button" role="radio" id={k === 0 ? `q-${q.id}` : undefined} aria-checked={answer?.text === o} {disabled} onclick={() => onchange({ text: o })} class={pill(answer?.text === o)}>{o}</button>
          {/each}
        </div>
      {/if}
    {:else if q.type === "photo"}
      {#if q.poses?.length}
        <div class="grid grid-cols-3 gap-2">
          {#each q.poses as pose, k (pose)}
            {@const url = answer?.photoDataUrls?.[k]}
            <div class="flex flex-col gap-1.5">
              {#if url}
                <img src={url} alt="{pose} photo" class="aspect-[3/4] w-full rounded-lg border border-border object-cover" />
                <Button variant="ghost" size="sm" {disabled} onclick={() => removePose(k)}>Remove</Button>
              {:else}
                <label class="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground hover:text-foreground {disabled ? 'pointer-events-none opacity-50' : ''}">
                  {pose}<span class="text-xs">Add</span>
                  <input id={k === 0 ? `q-${q.id}` : undefined} type="file" accept="image/*" class="sr-only" {disabled} onchange={(e) => photo(e, k)} />
                </label>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-wrap items-end gap-2">
          {#if answer?.photoDataUrl}<img src={answer.photoDataUrl} alt="Your photo for {q.prompt}" class="max-h-40 rounded-lg border border-border" />{/if}
          <label class="flex h-9 cursor-pointer items-center rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:text-foreground">
            {answer?.photoDataUrl ? "Change photo" : "Add photo"}
            <input id="q-{q.id}" type="file" accept="image/*" class="sr-only" {disabled} onchange={(e) => photo(e, null)} />
          </label>
          {#if answer?.photoDataUrl}<Button variant="ghost" size="sm" {disabled} onclick={() => onchange({ photoDataUrl: undefined })}>Remove</Button>{/if}
        </div>
      {/if}
      <span class="text-xs text-muted-foreground">Only {coachName} sees these.</span>
    {:else}
      <span class="text-xs text-muted-foreground">This question needs a newer version of LogIt.</span>
    {/if}
    {#if invalid}<span class="text-xs text-destructive">Please answer this one.</span>{/if}
  </div>
{/if}
