<!-- The server's last 14 days, one row per thing counted, darker = more. A real table so a
     screen reader gets the numbers; the colours are only for the eye. -->
<script lang="ts">
  import type { Overview } from "./adminApi";

  let { days, emailConfigured }: { days: Overview["days"]; emailConfigured: boolean } = $props();

  // Dates are UTC days from the server; read them as UTC so the weekday doesn't shift.
  const label = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 2);
  const full = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const rows = $derived([
    { label: "Sign-ups", values: days.map((d) => d.signUps) },
    { label: "Workouts", values: days.map((d) => d.workouts) },
  ]);

  function fill(n: number, max: number): string {
    if (n === 0) return "var(--muted)";
    const step = max <= 1 ? 3 : Math.min(3, Math.ceil((n / max) * 3));
    return `color-mix(in oklch, var(--chart-1) ${[0, 35, 60, 90][step]}%, transparent)`;
  }
</script>

<div class="relative overflow-x-auto">
  <table class="w-full min-w-[520px] table-fixed border-separate border-spacing-[5px] text-[13px]">
    <caption class="sr-only">Sign-ups and workouts per day, last 14 days</caption>
    <thead>
      <tr>
        <th class="w-[130px]"><span class="sr-only">What</span></th>
        {#each days as d, i (d.date)}
          <th scope="col" class="text-center text-[11px] font-normal text-muted-foreground {i === days.length - 1 ? 'text-foreground' : ''}">
            <span aria-hidden="true">{label(d.date)}</span><span class="sr-only">{full(d.date)}</span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.label)}
        {@const max = Math.max(...row.values)}
        <tr>
          <th scope="row" class="text-left font-normal text-muted-foreground">{row.label}</th>
          {#each row.values as n, i (i)}
            <td class="p-0" title="{full(days[i].date)}: {n}">
              <span class="block h-[26px] rounded-[5px] {i === days.length - 1 ? 'outline-2 outline-offset-1 outline-foreground' : ''}" style="background: {fill(n, max)}">
                <span class="sr-only">{n}</span>
              </span>
            </td>
          {/each}
        </tr>
      {/each}
      {#if !emailConfigured}
        <tr>
          <th scope="row" class="text-left font-normal text-warning">Email · not set up</th>
          {#each days as d, i (d.date)}
            <td class="p-0"><span class="block h-[26px] rounded-[5px] border border-dashed border-warning/50 {i === days.length - 1 ? 'outline-2 outline-offset-1 outline-foreground' : ''}"></span></td>
          {/each}
        </tr>
      {/if}
    </tbody>
  </table>
</div>
