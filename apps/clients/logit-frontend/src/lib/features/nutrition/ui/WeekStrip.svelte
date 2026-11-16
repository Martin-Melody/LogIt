<script lang="ts">
  import { ChevronLeft, ChevronRight } from "lucide-svelte";
  import { localDateIso } from "@logit/core/domain/nutrition";

  // Seven days ending at `endIso`. Each day's ring fills with how much of the calorie
  // target was eaten (full = within 10% of it, or over).
  interface Props {
    endIso: string;
    selectedIso: string;
    /** kcal eaten per date */
    kcalByDate: Record<string, number>;
    targetKcal: number | null;
    onselect: (iso: string) => void;
    onshift: (weeks: number) => void;
  }
  const { endIso, selectedIso, kcalByDate, targetKcal, onselect, onshift }: Props = $props();

  const today = localDateIso();
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const days = $derived.by(() => {
    const end = new Date(`${endIso}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(end);
      d.setDate(end.getDate() - (6 - i));
      const iso = localDateIso(d);
      const kcal = kcalByDate[iso] ?? 0;
      const frac = targetKcal ? Math.min(1, kcal / (targetKcal * 0.9)) : kcal > 0 ? 1 : 0;
      return { iso, day: d.getDate(), name: iso === today ? "Today" : WEEKDAY[d.getDay()], frac, kcal };
    });
  });

  // SVG arc for a ring fraction (r = 5.5, centred in 14×14).
  function arc(frac: number): string {
    if (frac <= 0 || frac >= 1) return "";
    const a = frac * 2 * Math.PI;
    const x = 7 + 5.5 * Math.sin(a);
    const y = 7 - 5.5 * Math.cos(a);
    return `M7 1.5 A5.5 5.5 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
</script>

<div class="flex items-center px-1 pb-2">
  <button type="button" class="flex h-11 w-8 shrink-0 items-center justify-center text-muted-foreground" aria-label="Earlier week" onclick={() => onshift(-1)}>
    <ChevronLeft class="size-4" />
  </button>
  <div class="flex flex-1 justify-between">
    {#each days as d (d.iso)}
      <button
        type="button"
        class="flex w-11 flex-col items-center gap-1 rounded-xl py-1.5 {d.iso === selectedIso ? 'bg-muted' : ''}"
        aria-current={d.iso === selectedIso ? "date" : undefined}
        aria-label="{d.iso}{d.kcal ? `, ${Math.round(d.kcal)} kcal` : ', nothing logged'}"
        onclick={() => onselect(d.iso)}
      >
        <span class="text-[11px] {d.iso === selectedIso ? 'font-semibold' : 'text-muted-foreground'}">{d.name}</span>
        <span class="text-[13px] tabular-nums {d.iso === selectedIso ? 'font-bold' : 'font-medium'}">{d.day}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {#if d.frac >= 1}
            <circle cx="7" cy="7" r="5.5" class="fill-foreground" />
          {:else}
            <circle cx="7" cy="7" r="5.5" fill="none" class="stroke-muted-foreground/20" stroke-width="2" />
            {#if d.frac > 0}<path d={arc(d.frac)} fill="none" class="stroke-foreground" stroke-width="2.2" stroke-linecap="round" />{/if}
          {/if}
        </svg>
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="flex h-11 w-8 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
    aria-label="Later week"
    disabled={endIso >= today}
    onclick={() => onshift(1)}
  >
    <ChevronRight class="size-4" />
  </button>
</div>
