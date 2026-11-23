<!-- Invite links and Payments for an account trying coaching with sample clients: these reach
     real people, so they come with Studio (the server says the same). -->
<script lang="ts">
  import { apiClient } from "@logit/core/api/client";

  let { what }: { what: "links" | "payments" } = $props();
  const MARKETING_URL: string = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
  const free = apiClient.getUser()?.tier === "Free";
</script>

<section class="flex max-w-xl flex-col gap-3 rounded-[14px] border border-border bg-card p-6">
  <h1 class="text-xl font-bold">{what === "links" ? "Invite links come with Studio" : "Payments come with Studio"}</h1>
  <p class="text-sm leading-relaxed text-muted-foreground">
    {what === "links"
      ? "An invite link lets a real person ask you to coach them. While you try things out, the sample clients play your clients: programs, check-ins and messages all work on them."
      : "With Studio, clients pay you through LogIt's web checkout, straight to your own Stripe account. Until then, you can coach the sample clients for free."}
  </p>
  <div class="flex flex-wrap gap-2">
    <a href={free ? "/upgrade" : `${MARKETING_URL}/pricing`} class="rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">See Studio</a>
    <a href="/coaching" class="rounded-[10px] border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Back to Today</a>
  </div>
</section>
