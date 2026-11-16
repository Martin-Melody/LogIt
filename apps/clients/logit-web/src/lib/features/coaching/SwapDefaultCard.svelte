<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import { coachApi, type ClientRelationship } from "@logit/core/api/coachApi";
  import { SWAP_RULES, type SwapRule } from "@logit/core/domain/swaps";

  // Coaching › Programs: the swap rule every client gets unless set differently on their
  // Programs tab. Saves on change.

  let {
    rule = $bindable(),
    clients,
  }: {
    rule: SwapRule;
    clients: ClientRelationship[];
  } = $props();

  let saving = $state(false);
  const different = $derived(clients.filter((c) => c.swapRule != null && c.swapRule !== rule));

  async function choose(next: SwapRule) {
    if (next === rule || saving) return;
    const before = rule;
    rule = next;
    saving = true;
    try {
      rule = (await coachApi.setDefaultSwapRule(next)).swapRule;
    } catch (e) {
      rule = before;
      toast.error(e instanceof Error ? e.message : "Couldn't save it");
    } finally {
      saving = false;
    }
  }

  const nameOf = (c: ClientRelationship) => c.client.displayName || c.client.username;
</script>

<section data-guide="swap-default" class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold">Exercise swaps</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">What clients can swap to during a workout from your program. Their own workouts aren't affected.</p>
    </div>
    <span class="text-xs text-muted-foreground">
      All clients{#each different as c, i (c.relationshipId)}{i === 0 ? " · " : ", "}<a href="/clients/{c.client.id}?tab=programs" class="underline hover:text-foreground">{nameOf(c)}</a>{/each}{different.length ? (different.length === 1 ? " is set differently" : " are set differently") : ""}
    </span>
  </div>
  <fieldset class="flex flex-wrap gap-2" disabled={saving}>
    <legend class="sr-only">Swap rule for all clients</legend>
    {#each SWAP_RULES as r (r.key)}
      <label class="flex flex-[1_1_220px] cursor-pointer items-start gap-2.5 rounded-[9px] border px-3.5 py-3 text-[13px] {rule === r.key ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50'}">
        <input type="radio" name="swap-rule" class="mt-0.5" checked={rule === r.key} onchange={() => choose(r.key)} />
        <span><span class="block font-semibold">{r.label}</span><span class="text-xs text-muted-foreground">{r.help}</span></span>
      </label>
    {/each}
  </fieldset>
  <p class="text-xs text-muted-foreground">Anything not allowed shows an "Ask to swap" button instead, which opens a message to you with the exercise filled in. Add alternatives under each exercise below.</p>
</section>
