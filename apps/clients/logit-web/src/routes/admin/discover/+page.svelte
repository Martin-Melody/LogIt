<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { adminApi, type DiscoverRow } from "$lib/features/admin/adminApi";

  let days = $state(30);
  let rows = $state<DiscoverRow[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const d = days;
    rows = null;
    adminApi.discover(d).then((r) => { if (days === d) rows = r; error = null; })
      .catch((e) => { error = e instanceof Error ? e.message : "Couldn't load Discover tests"; });
  });

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const kinds = [["post", "Posts shown", "Followed the author"], ["person", "People suggested", "Followed"]] as const;
</script>

<div class="flex max-w-[1100px] flex-col gap-[18px]">
  <header class="flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-[1_1_360px]">
      <h1 class="text-[26px] font-bold tracking-tight">Discover tests</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">Each account sees one version of Discover. Of what each version showed, how much people then liked, commented on or followed.</p>
    </div>
    <div role="tablist" aria-label="Period" class="flex gap-1.5">
      {#each [7, 30, 90] as d (d)}
        <button type="button" role="tab" aria-selected={days === d} onclick={() => (days = d)}
          class="h-8 rounded-full px-3 text-[13px] transition-colors {days === d ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}">{d} days</button>
      {/each}
    </div>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !rows}
    <Skeleton class="h-56" /><Skeleton class="h-40" />
  {:else}
    {#each kinds as [kind, title, followed] (kind)}
      {@const list = rows.filter((r) => r.kind === kind)}
      {@const best = Math.max(0.0001, ...list.map((r) => r.followRate))}
      <section aria-labelledby="k-{kind}" class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-[18px]">
        <h2 id="k-{kind}" class="text-[15px] font-semibold">{title}</h2>
        {#if list.length}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[680px] text-[13px] tabular-nums">
              <thead><tr class="text-left text-xs text-muted-foreground"><th class="pb-2 font-medium">Version</th><th class="pb-2 font-medium">Recipe</th><th class="pb-2 font-medium">Shown</th>{#if kind === "post"}<th class="pb-2 font-medium">Liked</th><th class="pb-2 font-medium">Commented</th>{/if}<th class="pb-2 font-medium">{followed}</th></tr></thead>
              <tbody>
                {#each list as r (r.arm + r.recipe)}
                  <tr class="border-t border-border">
                    <td class="py-2.5">{r.arm}</td>
                    <td class="py-2.5">{r.recipe}</td>
                    <td class="py-2.5">{r.shown.toLocaleString()}</td>
                    {#if kind === "post"}<td class="py-2.5">{r.liked.toLocaleString()}</td><td class="py-2.5">{r.commented.toLocaleString()}</td>{/if}
                    <td class="py-2.5"><span class="mr-2 inline-block h-2 rounded bg-chart-1/75 align-middle" style="width: {Math.max(2, Math.round((r.followRate / best) * 96))}px"></span>{pct(r.followRate)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-[13px] text-muted-foreground">Nothing shown in the last {days} days.</p>
        {/if}
      </section>
    {/each}
    <p class="text-[13px] text-muted-foreground">The versions are set under <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Discover</code> in the API's settings (names, share of accounts, recipes). Changing <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Salt</code> deals accounts into versions again.</p>
  {/if}
</div>
