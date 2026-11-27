<!-- Canvas W5: paid to you through LogIt, six months, so growth shows. "Best month yet" only when
     it's true, in record amber. V4: in Practice view samples don't pay, so it's an Example with
     made-up numbers, marked so it can't be mistaken for a real month. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { monthData, monthRange, money } from "./monthData.svelte";

  let { month, practice = false }: { month: string; practice?: boolean } = $props();

  const EXAMPLE = [32000, 40000, 40000, 48000, 48000, 64000];
  const data = $derived(monthData.months[month] ?? null);
  $effect(() => { if (!practice) void monthData.month(month).catch(() => {}); });

  const series = $derived(practice
    ? EXAMPLE.map((cents, i) => ({ month: shift(month, i - 5), cents }))
    : (data?.income ?? []));
  const currency = $derived(practice ? "eur" : (data?.currency ?? "eur"));
  const now = $derived(series.at(-1)?.cents ?? 0);
  const before = $derived(series.at(-2)?.cents ?? 0);
  const best = $derived(!practice && !!data && now > 0 && now > data.bestBeforeCents);
  const max = $derived(Math.max(1, ...series.map((s) => s.cents)));
  let hover = $state<number | null>(null);

  function shift(key: string, by: number): string {
    const [y, m] = key.split("-").map(Number) as [number, number];
    const d = new Date(y, m - 1 + by, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const short = (key: string) => monthRange(key).label.slice(0, 3);
</script>

<section aria-label="Paid to you" class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-sm font-semibold">Paid to you</h2>
    {#if practice}<span class="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Example</span>
    {:else if best}<span class="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">Best month yet</span>{/if}
  </div>
  {#if !practice && !data}
    <Skeleton class="h-40" />
  {:else}
    <div class="flex items-baseline gap-2">
      <span class="text-[28px] font-bold tabular-nums tracking-tight {practice ? 'text-muted-foreground' : ''}">{money(now, currency)}</span>
      {#if series.length > 1 && (now || before)}<span class="text-xs text-muted-foreground">{now >= before ? "+" : "−"}{money(Math.abs(now - before), currency)} on {monthRange(series.at(-2)!.month).label}</span>{/if}
    </div>
    <!-- Six columns: this month solid, the rest lighter; hover (or focus) a month for its amount. -->
    <div class="relative flex h-28 items-end gap-3 border-b border-border {practice ? 'opacity-60' : ''}" role="list" aria-label="Paid to you, last six months">
      {#each series as s, i (s.month)}
        {@const pct = s.cents > 0 ? Math.max(3, (s.cents / max) * 100) : 0}
        <div role="listitem" aria-label="{monthRange(s.month).label}: {money(s.cents, currency)}"
          class="relative flex h-full flex-1 items-end" onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)}>
          <div class="w-full rounded-t-[4px] transition-[height] duration-300 {practice ? 'bg-[repeating-linear-gradient(45deg,var(--color-muted-foreground)_0_3px,transparent_3px_6px)]' : i === series.length - 1 ? 'bg-primary' : 'bg-primary/35'} {hover === i ? 'ring-2 ring-ring/40' : ''}" style="height: {pct}%"></div>
          {#if hover === i}
            <span class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-sm">{monthRange(s.month).label}: <b class="tabular-nums">{money(s.cents, currency)}</b></span>
          {/if}
        </div>
      {/each}
    </div>
    <table class="sr-only"><caption>Paid to you by month</caption><tbody>{#each series as s (s.month)}<tr><th>{monthRange(s.month).label}</th><td>{money(s.cents, currency)}</td></tr>{/each}</tbody></table>
    <div class="-mt-1 flex gap-3" aria-hidden="true">{#each series as s (s.month)}<span class="flex-1 text-center text-[11px] text-muted-foreground">{short(s.month)}</span>{/each}</div>
    <p class="text-xs text-muted-foreground">
      {#if practice}Sample clients don't pay, so this shows what the card looks like with paying clients. Made-up numbers, never added to real ones.
      {:else}Through LogIt, before Stripe's fees.{#if data?.paidElsewhere} Plus {data.paidElsewhere} client{data.paidElsewhere === 1 ? "" : "s"} who pay you another way.{/if}{/if}
    </p>
  {/if}
</section>
