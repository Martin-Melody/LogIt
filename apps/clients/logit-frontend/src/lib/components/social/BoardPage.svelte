<!-- A whole board (design canvas G4 for a group, B2 for friends): this week, how it's scored,
     the table, and a note when you're not on it. Sends your own numbers first so your row is fresh. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onMount } from "svelte";
  
  import type { Board } from "@logit/core/api/boardsApi";
  import { trainingApi } from "@logit/core/api/trainingApi";
  import BoardTable from "./BoardTable.svelte";
  import { sendBoardWeek, thisBoardWeek } from "$lib/features/groups/boardSync";
  import { weekText } from "$lib/features/groups/boardPage.svelte";

  const { load, label, empty, hiddenNote }: { load: (week: string) => Promise<Board>; label: string; empty: string; hiddenNote: string } = $props();
  let board = $state<Board | null>(null);
  let error = $state(false);
  let training = $state(new Set<string>());

  onMount(async () => {
    try {
      await sendBoardWeek();
      board = await load((await thisBoardWeek()).week);
      training = new Set((await trainingApi.friends().catch(() => [])).map((f) => f.username));
    } catch {
      error = true;
    }
  });
</script>

{#if error}
  <p class="px-4 py-10 text-center text-sm text-muted-foreground">Couldn't load the board.</p>
{:else if !board}
  <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
{:else}
  <div class="flex flex-col gap-1 px-4 pb-2 pt-3.5">
    <h2 class="text-[15px] font-semibold">This week <span class="font-normal text-muted-foreground">· {weekText(board.week)}</span></h2>
    <p class="text-[13px] leading-snug text-muted-foreground">Scored on showing up, not on weight: planned workouts done, weeks kept in a row, and volume against your own usual.</p>
  </div>
  {#if board.rows.length}
    <BoardTable rows={board.rows} {training} {label} />
  {:else}
    <p class="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
  {/if}
  {#if board.meHidden}<p class="mx-4 mt-4 rounded-xl border border-border px-3.5 py-2.5 text-[13px] leading-snug text-muted-foreground">{hiddenNote}</p>{/if}
  <p class="mx-4 mt-6 text-[12px] leading-relaxed text-muted-foreground">Order: share of planned workouts done, then weeks kept. Green means this week's plan is all done. Only these numbers leave anyone's phone, never workouts or weights. People who haven't opened LogIt this week aren't listed.</p>
{/if}
