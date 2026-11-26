<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { shortDate } from "$lib/features/coaching/format";
  import { adminApi, at, type GrowthWeek } from "$lib/features/admin/adminApi";

  let weeks = $state<GrowthWeek[] | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      weeks = (await adminApi.growth()).weeks;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load growth";
    }
  });

  const label = (date: string) => shortDate(at(`${date}T00:00:00Z`));
  const max = $derived(Math.max(1, ...(weeks?.map((w) => w.signedUp) ?? [1])));
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "");
</script>

<div class="flex max-w-[1100px] flex-col gap-[18px]">
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">Growth</h1>
    <p class="mt-0.5 text-sm text-muted-foreground">Worked out from what the server already holds (accounts, synced workouts, subscriptions). Nothing extra is tracked.</p>
  </header>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if !weeks}
    <Skeleton class="h-48" /><Skeleton class="h-64" />
  {:else}
    <section aria-labelledby="signups" class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <h2 id="signups" class="text-[15px] font-semibold">Sign-ups per week <span class="font-normal text-muted-foreground">last 8 weeks</span></h2>
      <div class="grid h-[150px] grid-cols-8 items-end gap-2.5" role="img" aria-label="Sign-ups per week: {weeks.map((w) => `${label(w.weekOf)} ${w.signedUp}`).join(', ')}">
        {#each weeks as w (w.weekOf)}
          <div class="flex h-full flex-col justify-end gap-1.5">
            <span class="text-center text-xs tabular-nums">{w.signedUp}</span>
            <div class="rounded-t-md rounded-b-sm bg-chart-1/75" style="height: {Math.max(2, Math.round((w.signedUp / max) * 100))}px"></div>
            <span class="text-center text-[11px] text-muted-foreground">{label(w.weekOf)}</span>
          </div>
        {/each}
      </div>
    </section>

    <section aria-labelledby="cohorts" class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <h2 id="cohorts" class="text-[15px] font-semibold">What each week's sign-ups went on to do</h2>
      <p class="text-[13px] text-muted-foreground">Habit, not just sign-up: the column that matters most is "back in week 2". Weeks too recent to know show a dash.</p>
      <div class="overflow-x-auto">
        <Table.Root class="w-full min-w-[720px] text-[13px] tabular-nums">
          <Table.Header><Table.Row class="text-left text-xs text-muted-foreground"><Table.Head class="pb-2 font-medium">Week of</Table.Head><Table.Head class="pb-2 font-medium">Signed up</Table.Head><Table.Head class="pb-2 font-medium">Logged a workout</Table.Head><Table.Head class="pb-2 font-medium">3+ workouts in week 1</Table.Head><Table.Head class="pb-2 font-medium">Back in week 2</Table.Head><Table.Head class="pb-2 font-medium">Paying now</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each [...weeks].reverse() as w (w.weekOf)}
              <Table.Row class="border-t border-border">
                <Table.Cell class="py-2.5">{label(w.weekOf)}</Table.Cell>
                <Table.Cell class="py-2.5">{w.signedUp}</Table.Cell>
                {#each [w.loggedWorkout, w.threeInWeekOne, w.backInWeekTwo, w.payingNow] as n, i (i)}
                  <Table.Cell class="py-2.5">{#if n === null}<span class="text-muted-foreground">—</span>{:else}<b class="font-semibold">{n}</b> <span class="ml-1 text-muted-foreground">{pct(n, w.signedUp)}</span>{/if}</Table.Cell>
                {/each}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </section>

    <section class="rounded-[14px] border border-dashed border-border px-5 py-4">
      <h2 class="text-[15px] font-semibold">Not here yet</h2>
      <p class="text-[13px] text-muted-foreground">Steps before an account exists (opened the app, finished onboarding, started a first workout) need the anonymous, opt-in counts agreed for onboarding. They'll join this page once the app sends them.</p>
    </section>
  {/if}
</div>
