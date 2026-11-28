<!-- A coach's own how-to for an exercise (canvas HT4): shown to their clients instead of LogIt's.
     Pictures (uploaded), a YouTube or Vimeo link with its start, three cues, the most common
     mistake and a note in the coach's words. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toast } from "$lib/components/ui/sonner";
  import { uploadPhoto } from "@logit/core/api/photosApi";
  import { parseVideoLink, videoLabel, type CoachHowTo } from "@logit/core/domain/howTo";

  let { open = $bindable(false), exerciseName, current, logit, onsave, onremove }: {
    open?: boolean;
    exerciseName: string;
    current: CoachHowTo | null;
    /** LogIt's cues and mistake, to start from. */
    logit: { cues: string[]; mistake: string | null };
    onsave: (h: CoachHowTo) => Promise<void> | void;
    onremove: () => Promise<void> | void;
  } = $props();

  let pictures = $state<string[]>([]);
  let video = $state("");
  let cues = $state(["", "", ""]);
  let mistake = $state("");
  let note = $state("");
  let busy = $state(false);
  $effect(() => {
    if (!open) return;
    pictures = [...(current?.pictures ?? [])];
    video = current?.video ? (current.video.provider === "youtube" ? `https://youtu.be/${current.video.id}${current.video.startSec ? `?t=${current.video.startSec}` : ""}` : `https://vimeo.com/${current.video.id}${current.video.startSec ? `#t=${current.video.startSec}` : ""}`) : "";
    const c = current?.cues?.length ? current.cues : logit.cues;
    cues = [c[0] ?? "", c[1] ?? "", c[2] ?? ""];
    mistake = current?.mistake ?? logit.mistake ?? "";
    note = current?.note ?? "";
  });
  const parsed = $derived(video.trim() ? parseVideoLink(video) : null);
  const videoBad = $derived(!!video.trim() && !parsed);

  async function addPictures(files: FileList | null) {
    if (!files?.length) return;
    busy = true;
    try {
      for (const f of [...files].slice(0, 4 - pictures.length)) pictures = [...pictures, (await uploadPhoto(f)).url];
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that picture");
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (videoBad) return;
    busy = true;
    try {
      await onsave({
        exerciseName,
        ...(pictures.length ? { pictures } : {}),
        ...(parsed ? { video: parsed } : {}),
        cues: cues.map((c) => c.trim()).filter(Boolean),
        ...(mistake.trim() ? { mistake: mistake.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90svh] flex-col gap-3.5 overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>How to: {exerciseName}</Dialog.Title>
      <Dialog.Description>Your version, shown to your clients instead of LogIt's.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-1.5">
      <Label>Pictures <span class="font-normal text-muted-foreground">up to 4</span></Label>
      <div class="flex flex-wrap gap-2">
        {#each pictures as src, i (src)}
          <span class="relative">
            <img {src} alt="Picture {i + 1}" class="h-20 w-20 rounded-lg object-cover" />
            <button type="button" aria-label="Remove picture {i + 1}" class="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background" onclick={() => (pictures = pictures.filter((x) => x !== src))}>×</button>
          </span>
        {/each}
        {#if pictures.length < 4}
          <label class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/50">
            {busy ? "Adding…" : "+ Add"}
            <input type="file" accept="image/*" multiple class="sr-only" disabled={busy} onchange={(e) => void addPictures(e.currentTarget.files)} />
          </label>
        {/if}
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="ht-video">Video link <span class="font-normal text-muted-foreground">optional, YouTube or Vimeo</span></Label>
      <Input id="ht-video" bind:value={video} placeholder="https://youtu.be/…?t=12" />
      {#if videoBad}<span class="text-xs text-destructive">Use a YouTube or Vimeo link.</span>{:else if parsed}<span class="text-xs text-muted-foreground">{videoLabel(parsed)}. Plays in the app when they tap it.</span>{/if}
    </div>
    <div class="flex flex-col gap-1.5">
      <Label>Three things</Label>
      {#each cues as _c, i (i)}<Input bind:value={cues[i]} placeholder={i === 0 ? "Dumbbell at your chest, elbows under it" : ""} maxlength={140} aria-label="Cue {i + 1}" />{/each}
    </div>
    <div class="flex flex-col gap-1.5"><Label for="ht-mistake">Most common mistake</Label><Input id="ht-mistake" bind:value={mistake} maxlength={200} placeholder="Heels lifting: push through your whole foot" /></div>
    <div class="flex flex-col gap-1.5"><Label for="ht-note">Your note <span class="font-normal text-muted-foreground">optional</span></Label><Textarea id="ht-note" bind:value={note} rows={2} maxlength={400} placeholder="Go as deep as you can with a flat back. We'll work on depth." /></div>
    <Dialog.Footer class="gap-2">
      {#if current}<Button variant="ghost" class="mr-auto" disabled={busy} onclick={async () => { await onremove(); open = false; }}>Use LogIt's</Button>{/if}
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={busy || videoBad} onclick={() => void save()}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
