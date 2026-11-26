<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as Dialog from "$lib/components/ui/dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type ApiPost, type PostType } from "@logit/core/api/socialApi";
  import { attachmentSummary, cadenceText } from "@logit/core/domain/sharedContent";
  import { entryDetails, KIND_LABEL } from "@logit/core/domain/library";
  import {
    habitPayload,
    libraryPayload,
    loadComposerSources,
    prPayload,
    splitPayload,
    workoutPayload,
    type ComposerSources,
  } from "./socialData.svelte";

  // New post: words, and optionally one thing from your training. Algorithms and widgets
  // are set up on the phone, so they're shared from there.
  let { open = $bindable(false), discoverOn = true, onposted }: {
    open?: boolean;
    /** Whether your posts also go to Discover (for the line under the box). */
    discoverOn?: boolean;
    onposted?: (p: ApiPost) => void;
  } = $props();

  type Kind = "none" | "workout" | "pr" | "split" | "library" | "habit";
  const KINDS: [Kind, string][] = [
    ["none", "Nothing"], ["workout", "Workout"], ["pr", "PR"], ["split", "Split"], ["library", "Library item"], ["habit", "Habit"],
  ];
  const POST_TYPE: Record<Kind, PostType> = {
    none: "Text", workout: "WorkoutSession", pr: "PersonalRecord", split: "Split", library: "Exercise", habit: "Habit",
  };

  let body = $state("");
  let kind = $state<Kind>("none");
  let picked = $state<number | null>(null);
  let showAll = $state(false);
  let sources = $state<ComposerSources | null>(null);
  let loadError = $state(false);
  let sending = $state(false);

  $effect(() => {
    if (!open) return;
    body = "";
    kind = "none";
    picked = null;
    showAll = false;
    if (!sources) void loadComposerSources().then((s) => (sources = s)).catch(() => (loadError = true));
  });

  type Option = { title: string; detail: string };
  const options = $derived.by((): Option[] => {
    if (!sources) return [];
    const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    switch (kind) {
      case "workout":
        return sources.sessions.map(({ session: s, title }) => ({
          title,
          detail: `${day(s.startedAtMs)} · ${Math.round(((s.endedAtMs ?? s.startedAtMs) - s.startedAtMs) / 60000)} min · ${s.blocks.filter((b) => b.type === "strength").length} exercises`,
        }));
      case "pr":
        return sources.prs.map((p) => ({ title: p.exerciseName, detail: `${p.weight} kg × ${p.reps} · ${day(p.atMs)}` }));
      case "split":
        return sources.splits.map((s) => ({ title: s.name, detail: `${s.days.filter((d) => !d.rest).length} training days` }));
      case "library":
        return sources.library.map((e) => ({ title: e.item.name, detail: `${KIND_LABEL[e.kind]} · ${entryDetails(e)}` }));
      case "habit":
        return sources.habits.map((h) => ({ title: h.name, detail: cadenceText(h.cadence) }));
      default:
        return [];
    }
  });

  const payload = $derived.by((): string | undefined => {
    if (!sources || picked === null) return undefined;
    switch (kind) {
      case "workout": return workoutPayload(sources.sessions[picked].session);
      case "pr": return prPayload(sources.prs[picked]);
      case "split": return splitPayload(sources.splits[picked], sources.library);
      case "library": return libraryPayload(sources.library[picked]);
      case "habit": return habitPayload(sources.habits[picked]);
      default: return undefined;
    }
  });
  const preview = $derived(payload ? attachmentSummary(POST_TYPE[kind], payload) : null);
  const canPost = $derived(!sending && (kind === "none" ? body.trim().length > 0 : picked !== null));

  const EMPTY: Record<Kind, string> = {
    none: "",
    workout: "No finished workouts synced yet.",
    pr: "No PRs yet.",
    split: "No splits yet. Make one in Plan.",
    library: "None of your own items yet. Add them in Library.",
    habit: "No habits yet.",
  };

  async function post() {
    if (!canPost) return;
    sending = true;
    try {
      const created = await socialApi.createPost(POST_TYPE[kind], body.trim() || undefined, payload);
      onposted?.(created);
      open = false;
      toast.success("Posted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post that");
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[620px]">
    <Dialog.Header>
      <Dialog.Title>New post</Dialog.Title>
      <Dialog.Description class="sr-only">Write a post and attach something from your training.</Dialog.Description>
    </Dialog.Header>
    <label for="new-post" class="sr-only">What's on your mind</label>
    <textarea id="new-post" bind:value={body} rows="3" maxlength="2000" placeholder="Share a workout, a PR or a thought. @ to mention someone."
      class="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"></textarea>

    <div class="flex flex-col gap-2">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attach</span>
      <div role="radiogroup" aria-label="Attachment" class="flex flex-wrap gap-1.5">
        {#each KINDS as [k, label] (k)}
          <button type="button" role="radio" aria-checked={kind === k} onclick={() => { kind = k; picked = null; showAll = false; }}
            class="h-8 rounded-full border px-3 text-xs {kind === k ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'border-border text-muted-foreground'}">{label}</button>
        {/each}
      </div>
      <span class="text-xs text-muted-foreground">Algorithms and widgets are shared from the phone, where they're set up.</span>
    </div>

    {#if kind !== "none"}
      {#if loadError}
        <p class="text-[13px] text-muted-foreground">Couldn't load your training. Try again in a moment.</p>
      {:else if !sources}
        <p class="text-[13px] text-muted-foreground">Loading…</p>
      {:else if options.length === 0}
        <p class="text-[13px] text-muted-foreground">{EMPTY[kind]}</p>
      {:else}
        <RadioGroup.Root value={picked == null ? "" : String(picked)} onValueChange={(v) => (picked = Number(v))} aria-label="Pick one" class="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {#each (showAll ? options : options.slice(0, 4)) as o, i (i)}
            <label class="flex items-center gap-3 rounded-[9px] border px-3 py-2.5 text-[13px] {picked === i ? 'border-primary bg-muted' : 'border-border'}">
              <RadioGroup.Item value={String(i)} />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{o.title}</span>
                <span class="block truncate text-xs text-muted-foreground">{o.detail}</span>
              </span>
            </label>
          {/each}
          {#if !showAll && options.length > 4}
            <button type="button" onclick={() => (showAll = true)} class="self-start px-0.5 text-xs text-muted-foreground hover:text-foreground">Show {options.length - 4} more</button>
          {/if}
        </RadioGroup.Root>
      {/if}
    {/if}

    {#if preview}
      <div class="flex flex-col gap-1 rounded-lg bg-muted/60 px-3.5 py-3">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview · {preview.label}</span>
        <span class="text-[15px] font-semibold">{preview.title}</span>
        {#if preview.detail}<span class="line-clamp-2 text-xs text-muted-foreground">{preview.detail}</span>{/if}
      </div>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-2.5">
      <span class="text-xs text-muted-foreground">{discoverOn ? "Seen by your followers and in Discover" : "Seen by your followers"}</span>
      <div class="flex gap-2">
        <button type="button" onclick={() => (open = false)} class="h-9 rounded-[9px] border border-border px-3 text-[13px]">Cancel</button>
        <button type="button" disabled={!canPost} onclick={post} class="h-9 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Post</button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
