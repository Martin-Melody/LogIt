<!-- Your client limit (canvas C1, C4, A4): how many clients you take, what happens when you're
     full, and "expect spots". Open offers hold a spot each, so you never offer more than you have. -->
<script lang="ts">
  import { coachApi } from "@logit/core/api/coachApi";
  import type { CoachIntake } from "@logit/core/domain/coachRequest";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { toast } from "$lib/components/ui/sonner";

  let { open = $bindable(false), intake, onsaved }: { open?: boolean; intake: CoachIntake; onsaved: (i: CoachIntake) => void } = $props();

  let limited = $state(false);
  let spots = $state("12");
  let whenFull = $state<"waitlist" | "stop">("waitlist");
  let expect = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    limited = intake.spots !== null;
    spots = String(intake.spots ?? Math.max(intake.taken, 10));
    whenFull = intake.whenFull;
    expect = intake.expectSpots ?? "";
    error = null;
  });

  async function save() {
    const n = Number(spots);
    if (limited && (!Number.isInteger(n) || n < 1 || n > 500)) return void (error = "A client limit is a number from 1 to 500.");
    saving = true;
    error = null;
    try {
      const saved = await coachApi.saveIntake({ spots: limited ? n : null, whenFull, expectSpots: expect.trim() || null });
      toast.success("Saved");
      open = false;
      onsaved(saved);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Your client limit</Dialog.Title>
      <Dialog.Description>Clients and open offers each take a spot. Sample clients don't.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-5">
      <label class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium">Limit how many clients I take</span>
        <Switch bind:checked={limited} />
      </label>
      {#if limited}
        <div class="flex flex-col gap-1.5">
          <Label for="intake-spots">Spots</Label>
          <Input id="intake-spots" type="number" min={1} max={500} inputmode="numeric" bind:value={spots} class="w-28" />
          <span class="text-xs text-muted-foreground">{intake.taken} taken now.</span>
        </div>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">When you're full</legend>
          <RadioGroup.Root bind:value={whenFull}>
            <label class="flex items-start gap-2.5"><RadioGroup.Item value="waitlist" class="mt-0.5" />
              <span class="flex flex-col"><span class="text-sm">Keep a waiting list</span><span class="text-xs text-muted-foreground">Your profile says "Join the waiting list". You offer spots when they open.</span></span></label>
            <label class="flex items-start gap-2.5"><RadioGroup.Item value="stop" class="mt-0.5" />
              <span class="flex flex-col"><span class="text-sm">Stop taking requests</span><span class="text-xs text-muted-foreground">Your profile says "Not taking new clients".</span></span></label>
          </RadioGroup.Root>
        </fieldset>
      {/if}
      <div class="flex flex-col gap-1.5">
        <Label for="intake-expect">Expect spots <span class="font-normal text-muted-foreground">optional</span></Label>
        <Input id="intake-expect" bind:value={expect} maxlength={40} placeholder="January" />
        <span class="text-xs text-muted-foreground">Shown on your profile when you're full, and to people waiting.</span>
      </div>
      {#if error}<p class="text-[13px] text-destructive" role="alert">{error}</p>{/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={saving} onclick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
