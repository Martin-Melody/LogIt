<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Spinner } from "$lib/components/ui/spinner";
  import { coachPaymentsApi } from "@logit/core/api/coachPaymentsApi";
  import Logo from "@logit/ui/Logo.svelte";

  // The "update your card" link from a failed-payment email. Works signed out: the server
  // checks the link and hands back a fresh Stripe billing page, which we go straight to.
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const { url } = await coachPaymentsApi.billingPageFromEmail(page.params.token ?? "");
      location.replace(url);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't open the payment page. Try again in a minute.";
    }
  });
</script>

<header class="flex h-[52px] items-center border-b border-border px-4">
  <span class="flex items-center gap-2 text-[15px] font-bold"><Logo size={22} />LogIt</span>
</header>
<div class="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
  {#if error}
    <h1 class="text-lg font-bold">Couldn't open the card page</h1>
    <p class="text-[13px] leading-relaxed text-muted-foreground">{error}</p>
    <a href="/my-coach" class="mt-2 inline-flex h-10 items-center rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground">Open My coach</a>
  {:else}
    <Spinner class="size-6 text-muted-foreground" />
    <p class="text-[13px] text-muted-foreground">Opening Stripe's secure page…</p>
  {/if}
</div>
