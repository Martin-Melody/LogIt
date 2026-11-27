<!-- "Stop these emails" from the email sent when a coach answers a request (canvas R7). The link
     carries the key, so it works signed out. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { coachApi } from "@logit/core/api/coachApi";
  import Logo from "@logit/ui/Logo.svelte";

  let status = $state<"working" | "done" | "failed">("working");
  let error = $state("");

  onMount(async () => {
    try {
      await coachApi.stopRequestEmails(page.url.searchParams.get("u") ?? "", page.url.searchParams.get("t") ?? "");
      status = "done";
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't stop them. Try the link again.";
      status = "failed";
    }
  });
</script>

<svelte:head><title>Emails · LogIt</title></svelte:head>
<header class="flex h-[52px] items-center border-b border-border px-4">
  <span class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</span>
</header>
<main class="mx-auto flex w-full max-w-md flex-col gap-2 px-4 py-10" aria-live="polite">
  {#if status === "working"}
    <p class="text-[14px] text-muted-foreground">Stopping these emails…</p>
  {:else if status === "done"}
    <h1 class="text-lg font-bold">Done</h1>
    <p class="text-[14px] leading-relaxed text-muted-foreground">You won't get emails when a coach answers your request. Their replies are in LogIt, under My coach.</p>
  {:else}
    <h1 class="text-lg font-bold">That didn't work</h1>
    <p class="text-[14px] leading-relaxed text-muted-foreground">{error}</p>
  {/if}
</main>
