<!-- "This week with friends" on Social (design canvas B1): your line on the friends board, into it.
     Only when two or more friends are on it this week. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { CalendarCheck, ChevronRight } from "lucide-svelte";
  import { boardPlaces, boardsApi, type Board } from "@logit/core/api/boardsApi";
  import { thisBoardWeek } from "$lib/features/groups/boardSync";
  import { authStore } from "$lib/api/authStore.svelte";
  import { reveal } from "$lib/transitions";

  let board = $state<Board | null>(null);
  onMount(async () => {
    if (!authStore.isAuthenticated) return;
    try {
      board = await boardsApi.friends((await thisBoardWeek()).week);
    } catch {
      board = null;
    }
  });
  const friends = $derived(board?.rows.filter((r) => !r.me).length ?? 0);
  const line = $derived.by(() => {
    if (!board) return "";
    const i = board.rows.findIndex((r) => r.me);
    if (i < 0) return `${friends} friends on it this week`;
    const r = board.rows[i]!;
    const place = boardPlaces(board.rows)[i];
    const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
    return [r.rest ? "You: rest week" : `You: ${r.done} of ${r.planned} done`, `${r.weeksKept} ${r.weeksKept === 1 ? "week" : "weeks"} kept`, place ? `${ord(place)} of ${board.rows.length}` : null].filter(Boolean).join(" · ");
  });
</script>

{#if board && friends >= 2}
  <a href="/social/board" transition:reveal class="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-inherit no-underline">
    <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted"><CalendarCheck class="size-5" /></span>
    <span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="text-[15px] font-semibold">This week with friends</span><span class="truncate text-[13px] text-muted-foreground">{line}</span></span>
    <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
  </a>
{/if}
