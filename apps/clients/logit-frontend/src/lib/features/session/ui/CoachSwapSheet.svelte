<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { toast } from "$lib/components/ui/sonner/index";
  import type { LibraryEntry } from "@logit/core/domain/library";
  import {
    askToSwapMessage,
    blockedLabel,
    swapChoices,
    swapRuleExplainer,
    type SwapChoice,
    type SwapTarget,
  } from "@logit/core/domain/swaps";
  import { loadLibrary } from "$lib/data/library/library";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";
  import type { CachedCoach } from "$lib/features/coaching/coachCache";

  // Swapping an exercise in a workout from a coach's program: the coach's picks first, then
  // what their rule allows. Anything else is greyed out with "Ask <coach> to swap", which
  // sends them a message (queued if offline) and leaves the workout as it is.

  let {
    open = false,
    target,
    coach,
    onOpenChange,
    onPick,
  }: {
    open?: boolean;
    target: SwapTarget;
    coach: CachedCoach;
    onOpenChange: (v: boolean) => void;
    onPick: (selection: { name: string; exerciseId?: string }) => void | Promise<void>;
  } = $props();

  let library = $state<LibraryEntry[]>([]);
  let query = $state("");
  let asking = $state<string | null>(null);
  let sending = $state(false);

  $effect(() => {
    if (!open) {
      query = "";
      asking = null;
      return;
    }
    void loadLibrary("strength").then((l) => (library = l)).catch(() => (library = []));
  });

  const choices = $derived(swapChoices(coach.swapRule, target, library, query));
  const typed = $derived(query.trim());
  const blocked = $derived(choices.results.filter((r) => !r.verdict.allowed));
  const allowed = $derived(choices.results.filter((r) => r.verdict.allowed));
  // "Any exercise": a name that isn't in the library can still be used, as everywhere else.
  const canUseTyped = $derived(
    coach.swapRule === "any" && typed.length > 0 &&
      !choices.results.some((r) => r.name.toLowerCase() === typed.toLowerCase()) &&
      !choices.fromCoach.some((r) => r.name.toLowerCase() === typed.toLowerCase()),
  );
  // What "Ask" offers: the first greyed result, else what's typed (not for "any").
  const askFor = $derived(blocked[0]?.name ?? (coach.swapRule !== "any" && typed && !allowed.length && !choices.fromCoach.length ? typed : null));

  async function pick(c: { name: string; id?: string }) {
    await onPick({ name: c.name, exerciseId: c.id });
    onOpenChange(false);
  }

  async function send() {
    const body = asking?.trim();
    if (!body || sending) return;
    sending = true;
    try {
      await sendMessage(coach.relationshipId, body);
      toast.success(`Sent to ${coach.name}. Carry on, you'll see the reply in Messages.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      sending = false;
    }
  }

  const row = "flex min-h-[52px] w-full items-center justify-between gap-3 border-t border-border px-3 py-2 text-left text-[15px]";
  const section = "px-3 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
</script>

{#snippet option(c: SwapChoice, tag: string)}
  <button type="button" class="{row} hover:bg-muted/40" onclick={() => pick(c)}>
    <span>{c.name}</span><span class="text-right text-[11px] text-muted-foreground">{tag}</span>
  </button>
{/snippet}

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content class="flex max-h-[88svh] flex-col gap-0 p-0 sm:max-w-[420px]">
    <Dialog.Header class="px-4 pb-1 pt-4">
      <Dialog.Title>Swap {target.name}</Dialog.Title>
      <Dialog.Description>{swapRuleExplainer(coach.swapRule, coach.name, target)}</Dialog.Description>
    </Dialog.Header>

    {#if asking !== null}
      <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
        <label for="ask-msg" class="text-sm font-semibold">Message to {coach.name}</label>
        <textarea id="ask-msg" rows="3" bind:value={asking}
          class="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"></textarea>
        <p class="text-xs text-muted-foreground">You can carry on with the workout while you wait.</p>
        <div class="flex gap-2">
          <Button variant="outline" class="h-11 flex-1" onclick={() => (asking = null)}>Back</Button>
          <Button class="h-11 flex-1" disabled={sending || !asking.trim()} onclick={send}>{sending ? "Sending…" : `Send to ${coach.name}`}</Button>
        </div>
      </div>
    {:else}
      <div class="px-4 pb-1 pt-2.5">
        <label for="swap-q" class="sr-only">Search exercises</label>
        <input id="swap-q" bind:value={query} placeholder="Search exercises" autocomplete="off"
          class="h-11 w-full rounded-[12px] border border-border bg-background px-3.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pb-2">
        {#if choices.fromCoach.length}
          <div class={section}>From {coach.name}</div>
          {#each choices.fromCoach as c (c.name)}{@render option(c, `${coach.name}'s pick`)}{/each}
        {/if}

        {#if !typed}
          {#if choices.sameMuscles.length}
            <div class={section}>Same muscles</div>
            {#each choices.sameMuscles as c (c.name)}{@render option(c, c.detail)}{/each}
          {:else if !choices.fromCoach.length && coach.swapRule === "any"}
            <p class="px-4 py-3 text-sm text-muted-foreground">Search for any exercise.</p>
          {/if}
        {:else}
          {#if allowed.length || blocked.length || canUseTyped}<div class={section}>Results</div>{/if}
          {#each allowed as c (c.name)}{@render option(c, c.detail)}{/each}
          {#if canUseTyped}
            <button type="button" class="{row} hover:bg-muted/40" onclick={() => pick({ name: typed })}>
              <span>Use "{typed}"</span><span class="text-[11px] text-muted-foreground">new</span>
            </button>
          {/if}
          {#each blocked as c (c.name)}
            <div class="{row} text-muted-foreground/70" aria-disabled="true">
              <span>{c.name}</span><span class="text-right text-[11px] text-muted-foreground">{blockedLabel(c.verdict, coach.name)}</span>
            </div>
          {/each}
          {#if !allowed.length && !blocked.length && !canUseTyped && !choices.fromCoach.length}
            <p class="px-4 py-3 text-sm text-muted-foreground">Nothing called "{typed}".</p>
          {/if}
        {/if}

        {#if askFor}
          <div class="mx-3 mt-4 flex flex-col gap-2.5 rounded-[12px] bg-muted px-3.5 py-3.5">
            <span class="text-sm font-semibold">Need a different exercise today?</span>
            <span class="text-[13px] leading-snug text-muted-foreground">Ask {coach.name}. The message is written for you, and you can carry on with the workout while you wait.</span>
            <div class="rounded-[10px] bg-background px-3 py-2.5 text-[13px] leading-snug">{askToSwapMessage(target.name, askFor)}</div>
            <Button class="h-12" onclick={() => (asking = askToSwapMessage(target.name, askFor))}>Ask {coach.name} to swap</Button>
          </div>
        {/if}
      </div>

      {#if !askFor && coach.swapRule !== "any"}
        <div class="border-t border-border px-4 pb-5 pt-2.5">
          <Button variant="outline" class="h-12 w-full" onclick={() => (asking = askToSwapMessage(target.name))}>Ask {coach.name} for something else</Button>
        </div>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
