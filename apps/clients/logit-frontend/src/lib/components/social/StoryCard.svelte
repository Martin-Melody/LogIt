<!-- A story's workout or record, big (design canvas S2/S3), or as a sticker on a photo (S5/S6:
     just the label and the line). The same card data as a message card. -->
<script lang="ts">
  import { Dumbbell, Trophy } from "lucide-svelte";
  import { cardTitle, type Card } from "@logit/core/domain/messageCard";

  const { card, compact = false, sticker = false }: { card: Card; compact?: boolean; sticker?: boolean } = $props();
  const exercises = $derived(card.type === "WorkoutSession" && !sticker ? (card.data.exercises ?? []) : []);
</script>

<div class="flex flex-col rounded-2xl border border-border {sticker ? 'w-fit max-w-full gap-1 bg-card/90' : 'w-full gap-2 bg-card'} {sticker && compact ? 'px-2.5 py-2' : compact ? 'px-3.5 py-3' : 'px-4 py-4'}">
  {#if card.type === "PersonalRecord"}
    <span class="flex w-fit items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[12px] font-semibold text-warning"><Trophy class="size-3.5" />New record</span>
  {:else}
    <span class="flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground"><Dumbbell class="size-3.5" />Workout</span>
  {/if}
  <span class="{sticker ? (compact ? 'text-[14px]' : 'text-[18px]') : compact ? 'text-[17px]' : 'text-[24px]'} font-bold leading-tight tracking-tight tabular-nums">{cardTitle(card)}</span>
  {#if exercises.length}
    <ul class="mt-1 flex flex-col">
      {#each exercises.slice(0, compact ? 4 : 10) as e, i (i)}
        <li class="flex items-center justify-between gap-3 border-t border-border {compact ? 'py-1.5 text-[13px]' : 'py-2.5 text-[15px]'}">
          <span class="min-w-0 truncate">{e.name}</span>
          <span class="shrink-0 tabular-nums text-muted-foreground">{e.sets} {e.sets === 1 ? "set" : "sets"}</span>
        </li>
      {/each}
    </ul>
    {#if exercises.length > (compact ? 4 : 10)}<span class="text-[13px] text-muted-foreground">and {exercises.length - (compact ? 4 : 10)} more</span>{/if}
  {/if}
</div>
