<script lang="ts">
  import { page } from "$app/state";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { isInsightRange, isQuestionId, type InsightRange } from "@logit/core/domain/insights";
  import QuestionDetail from "$lib/features/insights/QuestionDetail.svelte";
  import { insightsSetup, savedRange, type InsightsSetup } from "$lib/features/insights/insightsData";

  const id = $derived(page.params.question ?? "");
  const urlRange = page.url.searchParams.get("range");
  // Starts at the Insights page's range; changing it here only changes this question.
  let range = $state<InsightRange>(isInsightRange(urlRange) ? urlRange : savedRange());
  let setup = $state<InsightsSetup | null>(null);

  $effect(() => {
    void insightsSetup().then((s) => (setup = s));
  });
</script>

<div class="flex flex-col gap-4">
  <a href="/insights" class="w-fit text-[13px] text-muted-foreground hover:text-foreground">‹ Insights</a>
  {#if !isQuestionId(id)}
    <p class="text-[13px] text-muted-foreground">There's no question here. <a href="/insights" class="underline">Back to Insights</a></p>
  {:else if !setup}
    <Skeleton class="h-10 w-96 max-w-full" /><Skeleton class="h-72" />
  {:else}
    {#key id}
      <QuestionDetail {id} {setup} bind:range />
    {/key}
  {/if}
</div>
