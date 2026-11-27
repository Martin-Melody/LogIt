<!-- Set away (canvas Z7): from, back on, a note pinned in every client's conversation, and two
     choices. Payments carry on; to stop charging one client, Pause coaching on their page. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DateField } from "$lib/components/ui/date-field";
  import { toast } from "$lib/components/ui/sonner";
  import { coachAway } from "./away.svelte";

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = day(new Date());
  let from = $state<string | undefined>(today);
  let until = $state<string | undefined>(undefined);
  let note = $state("");
  let excuse = $state(true);
  let tell = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!coachAway.dialogOpen) return;
    const a = coachAway.value;
    from = a ? a.from.slice(0, 10) : today;
    until = a ? a.until.slice(0, 10) : undefined;
    note = a?.note ?? "";
    excuse = a?.excuseCheckins ?? true;
    tell = a?.tellAskers ?? true;
    error = null;
  });

  // The suggested note follows the back-on day until the coach writes their own.
  const backText = $derived(until ? new Date(until).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
  const suggested = $derived(backText ? `Back on ${backText}. Keep training and check in as normal, I'll reply to everything when I'm back.` : "");

  async function save() {
    if (!from || !until) return void (error = "Pick both days.");
    if (until <= from) return void (error = "\"Back on\" has to be after the day you go.");
    busy = true;
    error = null;
    try {
      await coachAway.set({ from, until, note: (note.trim() || suggested) || undefined, excuseCheckins: excuse, tellAskers: tell });
      toast.success(`You're away ${from <= today ? "now" : `from ${new Date(from).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}, back on ${backText}`);
      coachAway.dialogOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      busy = false;
    }
  }

  async function end() {
    busy = true;
    try {
      await coachAway.end();
      toast.success("You're back");
      coachAway.dialogOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't end it";
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open={coachAway.dialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Away</Dialog.Title>
      <Dialog.Description>Your note is pinned in every client's conversation until you're back. It ends by itself on the "Back on" day.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5"><Label>From</Label><DateField bind:value={from} minIso={today} aria-label="From" /></div>
        <div class="flex flex-col gap-1.5"><Label>Back on</Label><DateField bind:value={until} minIso={from ?? today} aria-label="Back on" /></div>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="away-note">Note for your clients</Label>
        <Textarea id="away-note" rows={3} maxlength={500} bind:value={note} placeholder={suggested || "Back on 2 Jan. Keep training and check in as normal."} />
      </div>
      <label class="flex items-center justify-between gap-3 text-[13px]"><span>Check-ins due while you're away aren't marked late</span><Switch bind:checked={excuse} /></label>
      <label class="flex items-center justify-between gap-3 text-[13px]"><span>Tell people who ask to be coached when you're back</span><Switch bind:checked={tell} /></label>
      <p class="text-xs text-muted-foreground">Payments carry on. To stop charging someone while you're away, use Pause coaching on their page.</p>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer class="flex-wrap gap-2">
      {#if coachAway.value}<Button variant="ghost" class="mr-auto" disabled={busy} onclick={() => void end()}>{coachAway.value.now ? "End now" : "Cancel away"}</Button>{/if}
      <Button variant="outline" onclick={() => (coachAway.dialogOpen = false)}>Cancel</Button>
      <Button disabled={busy || !from || !until} onclick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
