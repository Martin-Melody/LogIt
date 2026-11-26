<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import PersonHoverCard from "$lib/features/admin/PersonHoverCard.svelte";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { shortDate } from "$lib/features/coaching/format";
  import { adminApi, at, type Subscriptions } from "$lib/features/admin/adminApi";

  let data = $state<Subscriptions | null>(null);
  let error = $state<string | null>(null);
  let show = $state<"paying" | "trial" | "problems" | "stopping" | "ended" | "test">("paying");

  onMount(async () => {
    try {
      data = await adminApi.subscriptions();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load subscriptions";
    }
  });

  type Row = Subscriptions["subscriptions"][number];
  const live = (s: Row) => !s.expiresAt || at(s.expiresAt) > Date.now();
  const groups: Record<typeof show, (s: Row) => boolean> = {
    paying: (s) => !s.isTest && !s.isTrial && ["Active", "Canceled", "GracePeriod"].includes(s.state) && live(s),
    trial: (s) => !s.isTest && !!s.isTrial && ["Active", "Canceled"].includes(s.state) && live(s),
    problems: (s) => !s.isTest && ["GracePeriod", "OnHold"].includes(s.state),
    stopping: (s) => !s.isTest && !s.isTrial && s.state === "Canceled" && live(s),
    ended: (s) => !s.isTest && (["Expired", "Revoked"].includes(s.state) || (s.state === "Canceled" && !live(s))),
    test: (s) => s.isTest,
  };
  const labels: Record<typeof show, string> = { paying: "Paying", trial: "Free trial", problems: "Payment problems", stopping: "Stopping", ended: "Ended", test: "Test purchases" };
  const rows = $derived(data ? data.subscriptions.filter(groups[show]) : []);
  const count = (k: typeof show) => (data ? data.subscriptions.filter(groups[k]).length : 0);

  const store = { Google: "Google Play", Apple: "App Store", Stripe: "Stripe" } as const;
  const stateText: Record<string, string> = { Active: "Active", Canceled: "Stopping", GracePeriod: "Payment failing", OnHold: "On hold", Paused: "Paused", Expired: "Ended", Revoked: "Refunded", Pending: "Pending" };
  const tone = (state: string) =>
    state === "Active" ? "bg-success/15 text-success" : state === "GracePeriod" || state === "OnHold" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
  function when(s: Row): string {
    if (!s.expiresAt) return "—";
    const d = shortDate(at(s.expiresAt));
    if (s.isTrial && s.state === "Active") return s.autoRenewing ? `Trial ends ${d}, then pays` : `Trial ends ${d}, won't pay`;
    if (s.state === "Active" && s.autoRenewing) return `Renews ${d}`;
    if (s.state === "GracePeriod") return `Access until ${d}`;
    return live(s) ? `Ends ${d}` : `Ended ${d}`;
  }
</script>

<div class="flex max-w-[1100px] flex-col gap-[18px]">
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">Subscriptions</h1>
    <p class="mt-0.5 text-sm text-muted-foreground">Everyone paying for Pro or Studio, wherever they bought it. Free trials and test purchases are counted apart.</p>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !data}
    <Skeleton class="h-24" /><Skeleton class="h-72" />
  {:else}
    {@const c = data.counts}
    <div class="flex flex-wrap gap-3">
      {#each [["Paying now", `${c.payingPro + c.payingStudio}`, `${c.payingPro} Pro · ${c.payingStudio} Studio${c.onTrial ? ` · ${c.onTrial} more on a free trial` : ""}`, false], ["New, last 30 days", `${c.newLast30Days}`, "", false], ["Stopping", `${c.stopping}`, "cancelled, paid until their date", false], ["Payment problems", `${c.paymentProblems}`, "the store is retrying the card", c.paymentProblems > 0], ["Plans given by hand", `${c.givenByHand}`, "friends and testers", false]] as [label, value, note, warn] (label)}
        <div class="flex-[1_1_170px] rounded-xl border bg-card px-4 py-3.5 {warn ? 'border-warning/40' : 'border-border'}">
          <span class="block text-[13px] text-muted-foreground">{label}</span>
          <strong class="text-2xl font-semibold tabular-nums {warn ? 'text-warning' : ''}">{value}</strong>
          {#if note}<span class="block text-xs text-muted-foreground">{note}</span>{/if}
        </div>
      {/each}
    </div>

    <section class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-4">
      <div role="tablist" aria-label="Show" class="flex flex-wrap gap-2">
        {#each Object.keys(labels) as k (k)}
          {@const key = k as typeof show}
          <button type="button" role="tab" aria-selected={show === key} onclick={() => (show = key)}
            class="h-8 rounded-full px-3 text-[13px] transition-colors {show === key ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}">{labels[key]} {count(key)}</button>
        {/each}
      </div>
      <div class="overflow-x-auto">
        <Table.Root class="w-full min-w-[720px] text-[13px]">
          <Table.Header><Table.Row class="text-left text-xs text-muted-foreground"><Table.Head class="pb-2 font-medium">Person</Table.Head><Table.Head class="pb-2 font-medium">Plan</Table.Head><Table.Head class="pb-2 font-medium">Store</Table.Head><Table.Head class="pb-2 font-medium">State</Table.Head><Table.Head class="pb-2 font-medium">Renews or ends</Table.Head><Table.Head class="pb-2 font-medium">Since</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each rows as s (s.id)}
              <Table.Row class="border-t border-border">
                <Table.Cell class="py-2.5"><PersonHoverCard username={s.user.username} id={s.user.id} class="text-primary hover:underline">{s.user.username}</PersonHoverCard></Table.Cell>
                <Table.Cell class="py-2.5">{s.plan}</Table.Cell>
                <Table.Cell class="py-2.5">{store[s.source]}</Table.Cell>
                <Table.Cell class="py-2.5"><span class="rounded-full px-2 py-px text-xs font-semibold {tone(s.state)}">{stateText[s.state] ?? s.state}</span></Table.Cell>
                <Table.Cell class="py-2.5">{when(s)}</Table.Cell>
                <Table.Cell class="py-2.5 text-muted-foreground">{shortDate(at(s.createdAt))}</Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={6} class="py-6 text-center text-muted-foreground">None.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
      <p class="text-[13px] text-muted-foreground">Prices and income live in Google Play Console. LogIt only knows who has which plan, and until when.</p>
    </section>
  {/if}
</div>
