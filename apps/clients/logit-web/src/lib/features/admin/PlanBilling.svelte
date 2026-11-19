<!-- getlogit.app only: a person's plan, where they bought it, its history, and a plan given by
     hand. Logit never handles money here: refunds and cancellations happen in the store. -->
<script lang="ts">
  import { toast } from "$lib/components/ui/sonner";
  import { shortDate, when } from "$lib/features/coaching/format";
  import { adminApi, at, type Person, type SubscriptionRow } from "./adminApi";

  let { person, onChanged }: { person: Person; onChanged: () => Promise<void> } = $props();

  let manual = $state<"Free" | "Pro" | "Studio">("Free");
  let saving = $state(false);
  $effect(() => { manual = person.manualTier ?? "Free"; });

  const GRANTS = ["Active", "Canceled", "GracePeriod"];
  const current = $derived(person.subscriptions.find((s) => !s.isTest && GRANTS.includes(s.state) && (!s.expiresAt || at(s.expiresAt) > Date.now())) ?? null);
  const plan = $derived(current?.plan ?? person.tier);
  const store = (s: SubscriptionRow) => ({ Google: "Google Play", Apple: "App Store", Stripe: "Stripe" })[s.source];
  const stateText: Record<string, string> = {
    Active: "Active", Canceled: "Stopping", GracePeriod: "Payment failing", OnHold: "On hold", Paused: "Paused",
    Expired: "Ended", Revoked: "Refunded", Replaced: "Replaced", Pending: "Pending",
  };
  const tone = (state: string) =>
    state === "Active" ? "bg-success/15 text-success" : state === "GracePeriod" || state === "OnHold" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";

  async function save() {
    saving = true;
    try {
      await adminApi.updatePerson(person.id, { tier: manual });
      toast.success(manual === "Free" ? "Plan given by hand removed" : `Gave ${manual}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the plan");
    } finally {
      saving = false;
    }
  }
</script>

<section aria-labelledby="plan" class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-4">
  <div class="flex flex-wrap items-baseline gap-2.5">
    <h3 id="plan" class="text-[15px] font-semibold">Plan and billing</h3>
    <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {plan === 'Free' ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'}">
      {plan}{current ? " · paying" : person.manualTier ? " · given by hand" : ""}
    </span>
  </div>

  {#if current}
    <div class="flex flex-wrap gap-2.5">
      {#each [["Bought in", store(current)], ["Plan", current.plan], [current.state === "Canceled" ? "Ends" : "Renews", current.expiresAt ? shortDate(at(current.expiresAt)) : "—"], ["Paying since", shortDate(at(current.createdAt))]] as [label, value] (label)}
        <div class="flex-[1_1_140px] rounded-xl border border-border bg-background px-3.5 py-3"><span class="block text-xs text-muted-foreground">{label}</span><strong class="text-base font-semibold">{value}</strong></div>
      {/each}
    </div>
    {#if current.source === "Google"}
      <p class="text-[13px] text-muted-foreground">To refund or cancel it, use Google Play Console › Order management and search for {person.email}. Logit picks up the change within a few minutes.</p>
    {/if}
  {:else}
    <p class="text-[13px] text-muted-foreground">Not paying for a plan.</p>
  {/if}

  <form class="flex flex-wrap items-end gap-3 border-t border-border pt-3" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <label class="flex flex-[0_1_200px] flex-col gap-1.5 text-[13px] font-medium">Plan given by hand
      <select bind:value={manual} class="h-9 rounded-[9px] border border-input bg-background px-2 text-sm">
        <option value="Free">None</option><option value="Pro">Pro</option><option value="Studio">Studio</option>
      </select>
    </label>
    <p class="min-w-0 flex-[1_1_240px] text-[13px] text-muted-foreground">For friends, testers or to make up for a problem. A paid plan still counts on top, and they get an email about it.</p>
    <button type="submit" disabled={saving || manual === (person.manualTier ?? "Free")} class="inline-flex h-[34px] items-center rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Save</button>
  </form>

  {#if person.subscriptions.length}
    <div class="overflow-x-auto border-t border-border pt-3">
      <table class="w-full min-w-[560px] text-[13px]">
        <thead><tr class="text-left text-xs text-muted-foreground"><th class="pb-2 font-medium">Plan</th><th class="pb-2 font-medium">Store</th><th class="pb-2 font-medium">State</th><th class="pb-2 font-medium">Period ends</th><th class="pb-2 font-medium">Last checked</th></tr></thead>
        <tbody>
          {#each person.subscriptions as s, i (i)}
            <tr class="border-t border-border">
              <td class="py-2">{s.plan}</td>
              <td class="py-2">{store(s)}{#if s.isTest}<span class="ml-1.5 rounded-full bg-warning/15 px-2 py-px text-[11px] font-semibold text-warning">Test</span>{/if}</td>
              <td class="py-2"><span class="rounded-full px-2 py-px text-xs font-semibold {tone(s.state)}">{stateText[s.state] ?? s.state}</span></td>
              <td class="py-2">{s.expiresAt ? shortDate(at(s.expiresAt)) : "—"}</td>
              <td class="py-2 text-muted-foreground">{s.checkedAt ? when(at(s.checkedAt)) : "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
